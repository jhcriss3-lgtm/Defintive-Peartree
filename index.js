// Webhook do WhatsApp
app.post("/webhook", (req, res) => {
  const message = req.body.Body || "";
  const from = req.body.From || "";

  console.log(`📩 Mensagem recebida de ${from}: ${message}`);

  let resposta = "";

  // Verifica se a mensagem inclui o comando de saudação
  if (message.toLowerCase().includes("fala") || message.toLowerCase().includes("oi")) {
    resposta = "👋 Hmph! Miserável, aqui é o Peartree, seu bot financeiro!";
  } 
  else if (message.toLowerCase().includes("saldo")) {
    resposta = `💰 Seu saldo atual é R$${saldo.toFixed(2)}... verme insolente!`;
  } 
  // Verifica se a mensagem inclui um valor numérico associado a "Entrada Salario"
  else if (/entrada\s*salario\s*(\d+[\.,]?\d*)/.test(message.toLowerCase())) {
    const valor = parseFloat(message.match(/entrada\s*salario\s*(\d+[\.,]?\d*)/i)[1].replace(',', '.'));
    saldo += valor;
    transacoes.push({ tipo: "entrada", categoria: "Salario", valor: valor, data: new Date() });
    resposta = `💵 Você recebeu um salário de R$${valor.toFixed(2)}. Agora seu saldo é R$${saldo.toFixed(2)}.`;
  } 
  else if (message.toLowerCase().includes("gastei mercado")) {
    saldo -= 50;
    transacoes.push({ tipo: "gasto", categoria: "Mercado", valor: 50, data: new Date() });
    resposta = `😡 Você gastou R$50 no Mercado! Agora seu saldo é R$${saldo.toFixed(2)}. O miserável é um miserável!`;
  } 
  else if (message.toLowerCase().includes("gastei moto")) {
    saldo -= 100;
    transacoes.push({ tipo: "gasto", categoria: "Moto", valor: 100, data: new Date() });
    resposta = `😡 Você gastou R$100 com a moto! Agora seu saldo é R$${saldo.toFixed(2)}. O miserável é um miserável!`;
  } 
  else if (message.toLowerCase().includes("gastei outros")) {
    saldo -= 30;
    transacoes.push({ tipo: "gasto", categoria: "Outros", valor: 30, data: new Date() });
    resposta = `😡 Você gastou R$30 em coisas outras! Agora seu saldo é R$${saldo.toFixed(2)}. Miserável!`;
  } 
  else if (message.toLowerCase().includes("gastei lazer")) {
    saldo -= 150;
    transacoes.push({ tipo: "gasto", categoria: "Lazer", valor: 150, data: new Date() });
    resposta = `😡 Você gastou R$150 com lazer! Agora seu saldo é R$${saldo.toFixed(2)}. Miserável!`;
  } 
  else if (message.toLowerCase().includes("investir")) {
    saldo += 100;
    transacoes.push({ tipo: "investir", categoria: "Extras", valor: 100, data: new Date() });
    resposta = `💹 O miserável é um gênio! Você investiu R$100. Saldo: R$${saldo.toFixed(2)}`;
  } 
  else if (message.toLowerCase().includes("emprestimo seus")) {
    const valor = 200; 
    saldo += valor;
    emprestimos.push({ numero: from, valor, pago: false });
    transacoes.push({ tipo: "emprestimo", categoria: "Emprestimos Seus", valor: valor, data: new Date() });
    agendarCobranca(from, valor, 1); 
    resposta = `💸 Você pegou um empréstimo de R$${valor}. Vou cobrar em breve, inseto!`;
  } 
  else if (message.toLowerCase().includes("emprestimo terceiros")) {
    const valor = 300;
    saldo += valor;
    transacoes.push({ tipo: "emprestimo", categoria: "Emprestimos para Terceiros", valor: valor, data: new Date() });
    resposta = `💸 Você deu um empréstimo de R$${valor} para terceiros! Agora, aguente as consequências!`;
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
  else if (message.toLowerCase().includes("relatorio semanal")) {
    resposta = gerarRelatorioSemanal();
  }
  else if (message.toLowerCase().includes("relatorio mensal")) {
    resposta = gerarRelatorioMensal();
  }
  else if (message.toLowerCase().includes("relatorio gastos")) {
    resposta = gerarRelatorioPorCategoria("gasto");
  }
  else if (message.toLowerCase().includes("relatorio entradas")) {
    resposta = gerarRelatorioPorCategoria("entrada");
  }
  else {
    resposta = "😤 Fale direito comigo, inseto! Use comandos como: saldo, gastar mercado, gastar moto, gastar outros, gastar lazer, investir, emprestimo seus, emprestimo terceiros, pagar, relatorio semanal, relatorio mensal, relatorio gastos, relatorio entradas.";
  }

  // Resposta em TwiML
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(resposta);

  res.type("text/xml");
  res.send(twiml.toString());
});
