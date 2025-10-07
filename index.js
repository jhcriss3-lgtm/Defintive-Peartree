const express = require("express");
const bodyParser = require("body-parser");
const twilio = require("twilio");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Rota principal
app.get("/", (req, res) => {
  res.send("Peartree Vegeta Bot está rodando! 🔥");
});

// Webhook do WhatsApp
app.post("/webhook", (req, res) => {
  console.log("📩 Mensagem recebida do Twilio:", req.body); // Log no Render

  const message = req.body.Body || "";
  const from = req.body.From || "";

  console.log(`➡️ Mensagem de ${from}: ${message}`);

  // Resposta padrão (pode personalizar depois)
  let resposta = "";

  if (message.toLowerCase().includes("oi")) {
    resposta = "👋 Miserável, você ousa falar comigo? Aqui é o Vegeta, seu bot financeiro!";
  } else if (message.toLowerCase().includes("saldo")) {
    resposta = "💰 Seu saldo é R$ 0,00... verme insolente!";
  } else if (message.toLowerCase().includes("investir")) {
    resposta = "🔮 O miserável é um gênio! Hora de investir em CDBs!";
  } else {
    resposta = "Hmph! Não entendi essa mensagem, inseto. 😤";
  }

  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(resposta);

  res.type("text/xml");
  res.send(twiml.toString());
});

// Render vai rodar na porta que ele definir
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🔥 Peartree Vegeta Bot rodando na porta ${PORT}`);
});
