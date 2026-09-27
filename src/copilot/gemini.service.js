import { COPILOT_SYSTEM_PROMPT } from "./copilot.prompts.js";

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-3.1-flash-lite-preview"
];

/**
 * Clean markdown JSON wraps if present
 */
function cleanJsonResponse(rawText) {
  if (!rawText) return "{}";
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

/**
 * Call Google Gemini REST API using native fetch
 */
export async function queryGeminiCopilot({
  userPrompt,
  history = [],
  currentProposal = null,
  contextData = null,
  images = []
}) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      message: "⚠️ **Google Gemini API Key Configured Nahi Hai!**\n\nKripya apne project ke `.env` file me `GEMINI_API_KEY=your_key_here` add karein aur server restart karein. Aap Google AI Studio se bilkul FREE API key le sakte hain.",
      action: { type: "NONE" }
    };
  }

  // Build conversational contents
  const contents = [];

  // Add relevant history items (up to last 10 messages)
  const recentHistory = Array.isArray(history) ? history.slice(-10) : [];
  for (const item of recentHistory) {
    if (item.role === "user" || item.role === "assistant") {
      contents.push({
        role: item.role === "assistant" ? "model" : "user",
        parts: [{ text: typeof item.content === "string" ? item.content : JSON.stringify(item.content) }]
      });
    }
  }

  // Construct current prompt with context and currently active proposal
  let enrichedPrompt = userPrompt;
  const contextNotes = [];

  if (contextData?.categories?.length) {
    contextNotes.push(`Available Categories in Lab: ${contextData.categories.map(c => c.category || c).slice(0, 30).join(", ")}`);
  }
  if (contextData?.existingTests?.length) {
    contextNotes.push(`Sample Existing Tests: ${contextData.existingTests.slice(0, 40).join(", ")}`);
  }
  if (contextData?.existingPanels?.length) {
    contextNotes.push(`Available Existing Panels in Lab: ${contextData.existingPanels.slice(0, 40).join(", ")}`);
  }
  if (currentProposal) {
    contextNotes.push(`Currently active proposal that the user might want to edit/confirm: ${JSON.stringify(currentProposal)}`);
  }
  if (contextData?.databaseAudit) {
    contextNotes.push(`[ACTUAL LAB DATABASE AUDIT DATA]:
Total tests in this lab: ${contextData.databaseAudit.totalTests}.
Tests with missing/incomplete fields: ${contextData.databaseAudit.totalIssuesFound}.
Specific tests with issues:
${JSON.stringify(contextData.databaseAudit.issues.slice(0, 15), null, 2)}
You have FULL AUTHORITY to propose BATCH_FIX_TESTS or FIX_TEST to fix and enrich these tests in the database.`);
  }
  if (contextData?.missingCatalogTests?.length) {
    contextNotes.push(`[ESSENTIAL STANDARD TESTS MISSING FROM THIS LAB'S DATABASE]:
The following standard clinical tests are NOT present in this lab's catalog:
${JSON.stringify(contextData.missingCatalogTests, null, 2)}

INSTRUCTION: Present these missing tests to the user in a clear, categorized, professional report in markdown. Explain the clinical reason for each test.
DO NOT output a CREATE_TEST action card! Set action to { "type": "NONE" }. Inform the user they can ask you to create any of these tests anytime (e.g. "D-Dimer test add kar do").`);
  }

  if (contextNotes.length > 0) {
    enrichedPrompt = `[LAB CONTEXT]:\n${contextNotes.join("\n")}\n\n[USER REQUEST]:\n${userPrompt}`;
  }

  const currentParts = [];

  // Process and attach images (OCR / Medical Report analysis)
  if (Array.isArray(images) && images.length > 0) {
    for (const img of images) {
      if (img?.data) {
        let cleanBase64 = String(img.data);
        let mimeType = img.mimeType || "image/jpeg";
        const matches = cleanBase64.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          cleanBase64 = matches[2];
        }
        currentParts.push({
          inlineData: {
            mimeType: mimeType,
            data: cleanBase64
          }
        });
      }
    }
  }

  currentParts.push({ text: enrichedPrompt });

  contents.push({
    role: "user",
    parts: currentParts
  });

  const payload = {
    systemInstruction: {
      parts: [{ text: COPILOT_SYSTEM_PROMPT }]
    },
    contents,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  };

  let lastError = null;

  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Gemini API model ${model} error (${response.status}):`, errorText);
        lastError = new Error(`Gemini API Error (${response.status}): ${errorText}`);
        continue; // try fallback model
      }

      const data = await response.json();
      const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!candidateText) {
        throw new Error("Gemini returned empty response text.");
      }

      const parsed = JSON.parse(cleanJsonResponse(candidateText));
      return {
        message: parsed.message || "Main aapka kaam taiyaar kar raha hoon...",
        action: parsed.action || { type: "NONE" },
        modelUsed: model
      };
    } catch (err) {
      console.error(`Attempt with ${model} failed:`, err.message);
      lastError = err;
    }
  }

  // If all models failed
  return {
    message: `Maaf kijiye, Gemini API se connect karte samay error aaya: ${lastError?.message || "Unknown error"}. Kripya API Key aur Internet connection check karein.`,
    action: { type: "NONE" }
  };
}
