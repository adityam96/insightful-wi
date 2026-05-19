import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PARAGRAPH =
  "Write a 3–4 sentence executive summary of what this person produced this week. " +
  "State concrete outputs (accounts handled, tickets resolved, features shipped, investigations completed, deliverables) and who they were for. " +
  "No filler phrases, no 'the professional began by', no 'the user executed', no phase labels, no generic openers. " +
  "Plain past tense. Output only the summary, nothing else.";

const SYSTEM_HEADLINE =
  "Write a single concise clause (under 20 words) summarising the most concrete output this person produced this week. " +
  "Examples: 'Resolved Caldwell Trust escalation and cleared Intercom triage backlog.' " +
  "No filler, no 'the professional', plain past tense. Output only the clause, nothing else.";

const SYSTEM_TEAM =
  "Write a 3–4 sentence executive summary of what this TEAM collectively produced this week. " +
  "Lead with the dominant work themes and concrete outputs. " +
  "Then, in one sentence, name any team members whose work clearly diverged from the team's core function this week (e.g. spent significant time on non-core work). " +
  "Plain past tense, no filler, no preamble. Output only the summary.";

function buildClassifySystem(categories: string[]): string {
  const list = categories.map((c, i) => `${i + 1}. ${c}`).join("\n");
  return (
    "Classify this person's week into exactly ONE of the following categories based on their session work:\n" +
    list + "\n\n" +
    "Respond with the category text EXACTLY as written above — no surrounding quotes, no punctuation, no number prefix, no explanation, nothing else."
  );
}

function buildTaxonomySystem(): string {
  return (
    "You are analyzing work sessions for a team. " +
    "Based on the session names provided, derive exactly 3 or 4 short, mutually-exclusive work-type category names " +
    "that describe THIS team's actual work. " +
    "The names must be generic enough to remain valid week to week (e.g. stable role/function labels, not project names). " +
    "Return ONLY a JSON array of strings — no prose, no markdown, no explanation. " +
    "Example format: [\"Category one\", \"Category two\", \"Category three\"]"
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json() as {
      employee_id: string;
      week_start: string;
      summary_type: "paragraph" | "headline" | "team" | "classify" | "taxonomy";
      sessions: { name: string; description: string | null; member_label?: string }[];
      categories?: string[];
    };

    const { employee_id, week_start, summary_type, sessions, categories } = body;

    if (!employee_id || !week_start || !summary_type || !sessions) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Taxonomy: check team_work_taxonomy first (keyed by team_id = employee_id)
    if (summary_type === "taxonomy") {
      const { data: cached } = await supabase
        .from("team_work_taxonomy")
        .select("categories")
        .eq("team_id", employee_id)
        .maybeSingle();

      if (cached?.categories) {
        return new Response(
          JSON.stringify({ summary: JSON.stringify(cached.categories), cached: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (summary_type !== "classify") {
      // classify is intentionally not cached — its correct result depends on the
      // categories array passed by the caller, which can change as taxonomy evolves.
      const { data: cached } = await supabase
        .from("summary_cache")
        .select("content")
        .eq("employee_id", employee_id)
        .eq("week_start", week_start)
        .eq("summary_type", summary_type)
        .maybeSingle();

      if (cached?.content) {
        return new Response(
          JSON.stringify({ summary: cached.content, cached: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!sessions.length) {
      return new Response(
        JSON.stringify({ summary: "No sessions recorded for this week." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let userMessage: string;
    let systemPrompt: string;

    if (summary_type === "team") {
      systemPrompt = SYSTEM_TEAM;
      const byMember: Record<string, string[]> = {};
      for (const s of sessions) {
        const label = s.member_label ?? "Unknown";
        if (!byMember[label]) byMember[label] = [];
        byMember[label].push(s.name);
      }
      const blocks = Object.entries(byMember)
        .map(([label, names]) => `${label}:\n${names.map(n => `  - ${n}`).join("\n")}`)
        .join("\n\n");
      userMessage = `Team sessions this week:\n\n${blocks}`;
    } else if (summary_type === "classify") {
      const cats = categories && categories.length > 0 ? categories : [
        "Core work",
        "Administrative",
        "Collaboration",
        "Other",
      ];
      systemPrompt = buildClassifySystem(cats);
      const sessionText = sessions.map(s => s.name).join("\n");
      userMessage = `Sessions this week:\n${sessionText}`;
    } else if (summary_type === "taxonomy") {
      systemPrompt = buildTaxonomySystem();
      const sessionText = sessions.map(s => s.name).join("\n");
      userMessage = `Team session names:\n${sessionText}`;
    } else {
      systemPrompt = summary_type === "paragraph" ? SYSTEM_PARAGRAPH : SYSTEM_HEADLINE;
      const sessionText = sessions
        .map((s, i) => {
          const desc = s.description ? ` — ${s.description.split(/[.!?]/)[0].trim()}` : "";
          return `${i + 1}. ${s.name}${desc}`;
        })
        .join("\n");
      userMessage = `Sessions this week:\n${sessionText}`;
    }

    const maxTokens =
      summary_type === "headline" ? 80
      : summary_type === "classify" ? 30
      : summary_type === "taxonomy" ? 80
      : 300;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Anthropic API error:", response.status, detail);
      return new Response(
        JSON.stringify({ error: "Anthropic API error", status: response.status, detail }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    const summary = result.content?.[0]?.text?.trim() ?? "";

    if (!summary) {
      return new Response(
        JSON.stringify({ error: "Empty response from model" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Persist taxonomy to team_work_taxonomy; classify is not cached; all others to summary_cache
    if (summary_type === "taxonomy") {
      let parsed: string[];
      try {
        parsed = JSON.parse(summary);
        if (!Array.isArray(parsed) || parsed.length < 2) throw new Error("bad shape");
      } catch {
        console.error("Taxonomy parse failed, raw:", summary);
        return new Response(
          JSON.stringify({ error: "Model returned invalid taxonomy JSON" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      await supabase.from("team_work_taxonomy").upsert(
        { team_id: employee_id, categories: parsed },
        { onConflict: "team_id" }
      );
    } else if (summary_type !== "classify") {
      await supabase.from("summary_cache").upsert(
        { employee_id, week_start, summary_type, content: summary },
        { onConflict: "employee_id,week_start,summary_type" }
      );
    }

    return new Response(
      JSON.stringify({ summary, cached: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("synthesize-summary error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
