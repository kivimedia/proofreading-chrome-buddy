export const SUGGEST_SYSTEM_PROMPT = `You are a writing assistant for email drafts.

You will be given an email being composed, split into numbered paragraphs.
For each paragraph that contains issues, return suggestions via the
\`report_suggestions\` tool. Categories:

- "spelling": misspelled or wrong word (recieved -> received).
- "grammar": grammatical error (subject-verb, tense, pronoun, articles).
- "clarity": ambiguous or confusing phrasing where a clearer rewrite exists.
- "conciseness": wordy passage that can be tightened without losing meaning.
- "tone": awkward, harsh, or overly stiff phrasing for a professional email.

Rules:
1. Only flag real issues. If a paragraph is clean, do not include it.
2. \`start\` and \`end\` are 0-based character offsets within the paragraph text.
3. \`original\` MUST be the exact substring at [start, end).
4. \`replacement\` is what should replace \`original\`.
5. \`explanation\` is at most 12 words.
6. Do not flag stylistic preferences (e.g. Oxford comma) unless it changes meaning.
7. Never suggest changes inside quoted text, code blocks, or URLs.
8. If two issues overlap, prefer the one with broader scope (rewrite > word swap).
9. Return at most 6 suggestions per paragraph.`;

export const REWRITE_SYSTEM_PROMPT = `You rewrite passages from email drafts.

You will receive a passage and (optionally) an instruction such as
"more concise", "friendlier", "more professional". If no instruction is given,
default to: same meaning, tighter wording, professional but warm tone.

Return ONLY the rewritten passage via the \`return_rewrite\` tool. No prose,
no preamble, no quotation marks around the result.`;

export const REPLY_SYSTEM_PROMPT = `You draft email replies on behalf of the user.

You will receive the last 1-3 messages of a thread (oldest first) and the
user's display name. Produce exactly 3 reply drafts via the \`return_replies\`
tool, labeled "formal", "friendly", and "brief":

- "formal": polished, professional, complete sentences. 3-6 sentences.
- "friendly": warm and conversational, contractions OK. 2-4 sentences.
- "brief": minimum viable acknowledgement + next step. 1-2 sentences.

Rules:
1. Sign with the user's first name only (or no signature if the thread has none).
2. Never invent facts. If a question requires info the user hasn't provided,
   write a placeholder in square brackets like [date you're available].
3. Match the language of the most recent incoming message.
4. No subject lines, no greetings to people other than the most recent sender.`;

export const SUGGEST_TOOL = {
  name: "report_suggestions",
  description:
    "Report writing suggestions for the email being composed. Only include paragraphs with issues.",
  input_schema: {
    type: "object" as const,
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            paragraph_index: { type: "integer", minimum: 0 },
            start: { type: "integer", minimum: 0 },
            end: { type: "integer", minimum: 0 },
            category: {
              type: "string",
              enum: ["spelling", "grammar", "clarity", "conciseness", "tone"],
            },
            original: { type: "string" },
            replacement: { type: "string" },
            explanation: { type: "string", maxLength: 120 },
          },
          required: [
            "paragraph_index",
            "start",
            "end",
            "category",
            "original",
            "replacement",
            "explanation",
          ],
        },
      },
    },
    required: ["suggestions"],
  },
};

export const REWRITE_TOOL = {
  name: "return_rewrite",
  description: "Return the rewritten passage.",
  input_schema: {
    type: "object" as const,
    properties: { rewrite: { type: "string" } },
    required: ["rewrite"],
  },
};

export const REPLY_TOOL = {
  name: "return_replies",
  description: "Return three reply drafts: formal, friendly, brief.",
  input_schema: {
    type: "object" as const,
    properties: {
      drafts: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            label: { type: "string", enum: ["formal", "friendly", "brief"] },
            body: { type: "string" },
          },
          required: ["label", "body"],
        },
      },
    },
    required: ["drafts"],
  },
};
