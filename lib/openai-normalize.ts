import OpenAI from "openai";

export async function normalizeSubmission(input: Record<string, unknown>) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return {
      normalized: null,
      confidence_score: 0,
      processing_notes: "OPENAI_API_KEY not configured. Submission saved in demo fallback mode."
    };
  }

  const client = new OpenAI({ apiKey: key });

  const prompt = `Normalize this sneaker submission into strict JSON with keys:
brand,shoe_name,model_line,version_name,release_year,forefoot_midsole_tech,heel_midsole_tech,outsole_tech,upper_tech,cushioning_feel,court_feel,bounce,stability,traction,fit,playstyle_summary,story_title,story_summary,tags,source_links,confidence_score,reviewer_notes.\nInput:${JSON.stringify(
    input
  )}`;

  const completion = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.1,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" }
  });

  const text = completion.choices[0]?.message?.content ?? "{}";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      normalized: null,
      confidence_score: 0,
      processing_notes: "OpenAI returned malformed JSON; saved in fallback mode."
    };
  }

  return {
    normalized: parsed,
    confidence_score: Number(parsed.confidence_score ?? 0),
    processing_notes: "Normalized with OpenAI"
  };
}
