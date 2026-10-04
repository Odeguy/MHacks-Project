import { requestGrok, responseText } from "./grok";

try {
  const response = await requestGrok(
    {
      apiKey: process.env.XAI_API_KEY ?? "",
      model: process.env.XAI_MODEL || "grok-4.7",
    },
    {
      input:
        "Suggest one name for a two-player fantasy card game. Reply with the name only.",
      max_output_tokens: 1024,
    },
  );
  console.log(responseText(response));
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Grok request failed.",
  );
  process.exitCode = 1;
}
