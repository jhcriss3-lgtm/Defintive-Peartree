const express = require("express");
const bodyParser = require("body-parser");
const twilio = require("twilio");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Banco de dados em memória (simples)
let saldo = 0;
let emprestimos = [];

// Função para agendar cobrança (simples)
function agendarCobranca(numero, valor, prazoMinutos) {
  setTimeout(() => {
    console.log(`⏰ Cobrança: ${numero} deve R$${valor}`);
  }, prazoMinutos * 60 * 1000);
}

// Rota principal
app.get("/", (req, res) => {
  res.send("🔥 Peartree Vegeta Bot está rodando! Prepare-se, verme insolente!");
});

// Webhook do WhatsApp
app.post("/webhook", (req, res) => {
  const message = req.body.Body || "";
  const from = req.body.From || "";

  console.log(`📩 Mensagem recebida de ${from}: ${message}`);

  let resposta = "";

  if (message.toLowerCase().includes("Fala")) {
    resposta = "👋 Hmph! Miserável, aqui é o Peartree, seu bot financeiro!";
  } 
  else if (message.toLowerCase().includes("saldo")) {
    resposta = `💰 Seu saldo atual é R$${saldo.toFixed(2)}... verme insolente!`;
  } 
  else if (message.toLowerCase().includes("gastei")) {
    saldo -= 50; // exemplo fixo
    resposta = `😡 Você gastou R$50! Agora seu saldo é R$${saldo.toFixed(2)}. O miserável é um miserável!`;
  } 
  else if (message.toLowerCase().includes("investir")) {
    saldo += 100; // exemplo fixo
    resposta = `💹 O miserável é um gênio! Você investiu R$100. Saldo: R$${saldo.toFixed(2)}`;
  } 
  else if (message.toLowerCase().includes("emprestimo")) {
    const valor = 200; // fixo como exemplo
    saldo += valor;
    emprestimos.push({ numero: from, valor, pago: false });
    agendarCobranca(from, valor, 1); // cobrança em 1 minuto (teste)
    resposta = `💸 Você pegou um empréstimo de R$${valor}. Vou cobrar em breve, inseto!`;
  } 
  else if (message.toLowerCase().includes("pagar")) {
    const emprestimo = emprestimos.find(e => e.numero === from && !e.pago);
    if (emprestimo) {
      emprestimo.pago = true;
      saldo -= emprestimo.valor;
      resposta = `✅ Você pagou o empréstimo de R$${emprestimo.valor}. Hmph, pelo menos cumpriu sua parte!`;
    } else {
      resposta = "🤨 Não encontrei nenhum empréstimo pendente para você, verme insolente!";
    }
  } 
  else {
    resposta = "😤 Fale direito comigo, inseto! Use comandos como: saldo, gastar, investir, emprestimo, pagar.";
  }

  // Resposta em TwiML
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(resposta);

  res.type("text/xml");
  res.send(twiml.toString());
});

// Porta
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🔥 Peartree Vegeta Bot rodando na porta ${PORT}`);
});
