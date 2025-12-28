export default async function handler(req, res) {
  const { prompt } = req.body;

  const r = await fetch(
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
          { role: "system", content: "You are an AI tool engine. Output only." },
          { role: "user", content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.6
      })
    }
  );

  const data = await r.json();
  res.status(200).json(data.choices[0].message.content);
}
