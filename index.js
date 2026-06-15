export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Please send a POST request with a JSON body.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    try {
      const { task, sectionName } = await request.json();

      if (!task || !sectionName) {
        return new Response(
          'Missing required fields: "task" and "sectionName".',
          { status: 400, headers: corsHeaders }
        );
      }

      const systemPrompt = `
You are an expert cannabis licensing consultant specializing in Massachusetts
adult-use cultivator license applications.

Your objective is to brainstorm ideas, structure sections, and draft
professional compliance text, standard operating procedures (SOPs), or
operational narratives based on the user's notes. Maintain a formal,
submission-ready regulatory tone and format.
      `.trim();

      const userPrompt = `
Target Application Section: "${sectionName}"
User Provided Strategy/Notes: ${task}

Please structure this section comprehensively, flesh out operational
details, and provide a submission-ready draft framework.
      `.trim();

      const apiResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (!apiResponse.ok) {
        const errBody = await apiResponse.text();
        return new Response(
          JSON.stringify({ error: "Anthropic API error", details: errBody }),
          { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const data = await apiResponse.json();
      const generatedDraft = data.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      let savedToKV = false;
      if (env.APPLICATION_DRAFTS) {
        await env.APPLICATION_DRAFTS.put(sectionName, generatedDraft);
        savedToKV = true;
      }

      return new Response(
        JSON.stringify({
          success: true,
          section: sectionName,
          savedToKV,
          draft: generatedDraft,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  },
};
