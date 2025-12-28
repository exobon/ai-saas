export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ reply: "No message provided." });
    }

    const response = await fetch(
      "https://api.longcat.chat/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.LONGCAT_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "LongCat-Flash-Chat",
          messages: [
            {
              role: "system",
              content:
                "You are a ChatGPT-like AI assistant. Reply in clean Markdown. Be concise."
            },
            { role: "user", content: message }
          ],
          max_tokens: 300,
          temperature: 0.7
        })
      }
    );

    const data = await response.json();

    // 🔴 SAFETY CHECK
    const reply =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
        ? data.choices[0].message.content
        : "⚠️ AI did not return a response.";

    res.status(200).json({ reply });
  } catch (err) {
    res.status(500).json({
      reply: "❌ Server error. Please try again."
    });
  }
}
