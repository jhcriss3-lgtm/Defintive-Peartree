require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const twilio = require('twilio');
const cron = require('node-cron');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Environment variables (from .env)
const DATABASE_URL = process.env.DATABASE_URL;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_WHATSAPP = process.env.TWILIO_WHATSAPP || 'whatsapp:+14155238886';
const TO_WHATSAPP = process.env.TO_WHATSAPP || 'whatsapp:+5527995102695';
const PORT = process.env.PORT || 10000;

if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set. Edit .env and add it.');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

// ===== INIT DB =====
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      phone TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('income','expense')),
      amount NUMERIC(12,2) NOT NULL,
      category TEXT,
      note TEXT,
      occurred_at TIMESTAMP DEFAULT now(),
      created_at TIMESTAMP DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS loans (
      id SERIAL PRIMARY KEY,
      phone TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      due_at TIMESTAMP,
      paid BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bills (
      id SERIAL PRIMARY KEY,
      phone TEXT NOT NULL,
      description TEXT,
      amount NUMERIC(12,2),
      due_date DATE,
      notified BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT now()
    );
  `);
  console.log('DB initialized');
}

// ===== Vegeta responses =====
function vegetaReplyBase() { return 'Peartree Vegeta: '; }

function randomVegeta(type) {
  const phrases = {
    spend: [
      "Verme insolente! Patético desperdício!",
      "Hmph! Gastou de novo? Você não aprende."
    ],
    income: [
      "O miserável é um gênio... por enquanto.",
      "Hmph, dinheiro? Use com sabedoria, verme."
    ],
    loan: [
      "Você quer um empréstimo? Cuidado, inseto.",
      "Toma o dinheiro, e pague antes que eu volte."
    ],
    reminder: [
      "Lembrete: cobre essa dívida, miserável.",
      "Hmph — não esqueça de pagar o que deve."
    ],
    default: [
      "Hmph! Não entendi, fale direito, inseto."
    ]
  };
  const arr = phrases[type] || phrases.default;
  return arr[Math.floor(Math.random()*arr.length)];
}

// ===== Helpers =====
async function getBalance(phone) {
  const res = await pool.query(`
    SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE -amount END),0) AS balance
    FROM transactions WHERE phone = $1
  `, [phone]);
  return parseFloat(res.rows[0].balance || 0);
}

async function sendWhatsApp(to, body) {
  if (!client) {
    console.error('Twilio client not configured. Skipping send:', body);
    return;
  }
  try {
    const msg = await client.messages.create({
      from: TWILIO_WHATSAPP,
      to,
      body
    });
    console.log('Sent WhatsApp message SID:', msg.sid);
    return msg;
  } catch (e) {
    console.error('Error sending WhatsApp message:', e.message || e);
  }
}

function parseCommand(text) {
  text = (text || '').toLowerCase().trim();
  if (/^(entrada|recebi|income)\b/.test(text)) return { cmd: 'income', text };
  if (/^(saida|gasto|gaste|expense)\b/.test(text)) return { cmd: 'expense', text };
  if (text.startsWith('relatorio')) return { cmd: 'report', text };
  if (text.startsWith('emprestimo') || text.startsWith('empresto')) return { cmd: 'loan', text };
  if (text.startsWith('pagar')) return { cmd: 'payloan', text };
  if (text.startsWith('fatura adicionar') || text.startsWith('conta adicionar')) return { cmd: 'addbill', text };
  if (text.startsWith('faturas') || text.startsWith('contas')) return { cmd: 'listbills', text };
  if (text.startsWith('saldo')) return { cmd: 'balance', text };
  return { cmd: 'unknown', text };
}

function extractAmount(text) {
  const m = text.match(/(\d+[.,]?\d{0,2})/);
  if (!m) return null;
  return parseFloat(m[1].replace(',', '.'));
}

// ===== Webhook =====
app.post('/webhook', async (req, res) => {
  try {
    console.log('Incoming webhook body:', req.body);
    const from = req.body.From || 'whatsapp:unknown';
    const body = req.body.Body || '';
    const phone = from;
    const parsed = parseCommand(body);

    let reply = vegetaReplyBase();
    if (parsed.cmd === 'income') {
      const amount = extractAmount(parsed.text) || 0;
      const note = parsed.text;
      await pool.query(`INSERT INTO transactions (phone,type,amount,category,note) VALUES ($1,'income',$2,$3,$4)`,
        [phone, amount, 'income', note]);
      reply += randomVegeta('income') + ` (+R$${amount.toFixed(2)})`;
    } else if (parsed.cmd === 'expense') {
      const amount = extractAmount(parsed.text) || 0;
      const note = parsed.text;
      await pool.query(`INSERT INTO transactions (phone,type,amount,category,note) VALUES ($1,'expense',$2,$3,$4)`,
        [phone, amount, 'expense', note]);
      reply += randomVegeta('spend') + ` (-R$${amount.toFixed(2)})`;
    } else if (parsed.cmd === 'balance') {
      const bal = await getBalance(phone);
      reply += `Seu saldo atual: R$ ${bal.toFixed(2)}.`;
    } else if (parsed.cmd === 'report') {
      const resTx = await pool.query(`
        SELECT type, SUM(amount) as total FROM transactions
        WHERE phone=$1 AND date_trunc('month', occurred_at)=date_trunc('month', now())
        GROUP BY type
      `, [phone]);
      let income = 0, expense = 0;
      resTx.rows.forEach(r=> {
        if (r.type==='income') income = parseFloat(r.total);
        if (r.type==='expense') expense = parseFloat(r.total);
      });
      const bal = income - expense;
      reply += `Relatório mês: Entradas R$${income.toFixed(2)}, Saídas R$${expense.toFixed(2)}, Saldo R$${bal.toFixed(2)}.`;
    } else if (parsed.cmd === 'loan') {
      const amount = extractAmount(parsed.text) || 0;
      const due = new Date(Date.now() + 3*24*60*60*1000);
      await pool.query(`INSERT INTO loans (phone,amount,due_at) VALUES ($1,$2,$3)`, [phone, amount, due]);
      reply += randomVegeta('loan') + ` Empréstimo de R$${amount.toFixed(2)} registrado. Vence em ${due.toISOString().slice(0,10)}.`;
    } else if (parsed.cmd === 'payloan') {
      const loanRes = await pool.query(`SELECT * FROM loans WHERE phone=$1 AND paid=false ORDER BY created_at LIMIT 1`, [phone]);
      if (loanRes.rows.length===0) {
        reply += 'Nenhum empréstimo pendente encontrado.';
      } else {
        const loan = loanRes.rows[0];
        await pool.query(`UPDATE loans SET paid=true WHERE id=$1`, [loan.id]);
        reply += `✅ Empréstimo de R$${parseFloat(loan.amount).toFixed(2)} marcado como pago.`;
      }
    } else if (parsed.cmd === 'addbill') {
      const parts = parsed.text.split(/\s+/);
      const day = parts[2] || null;
      const desc = parts[3] || 'fatura';
      const amount = extractAmount(parsed.text) || 0;
      let due_date = null;
      if (day && /^\d{1,2}$/.test(day)) {
        const d = new Date();
        d.setDate(parseInt(day));
        due_date = d.toISOString().slice(0,10);
      }
      await pool.query(`INSERT INTO bills (phone,description,amount,due_date) VALUES ($1,$2,$3,$4)`,
        [phone, desc, amount, due_date]);
      reply += `Fatura cadastrada: ${desc} R$${amount.toFixed(2)} vence em ${due_date || 'data indefinida'}.`;
    } else if (parsed.cmd === 'listbills') {
      const bres = await pool.query(`SELECT id,description,amount,due_date FROM bills WHERE phone=$1 ORDER BY due_date NULLS LAST`, [phone]);
      if (bres.rows.length===0) reply += 'Nenhuma fatura encontrada.';
      else {
        reply += 'Faturas:\n' + bres.rows.map(r=> `#${r.id} ${r.description} R$${parseFloat(r.amount).toFixed(2)} vence ${r.due_date || '---'}`).join('\n');
      }
    } else {
      reply += randomVegeta('default');
    }

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(reply);
    res.type('text/xml').send(twiml.toString());

  } catch (err) {
    console.error('Webhook error', err);
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message('Erro interno no Peartree Vegeta.');
    res.type('text/xml').send(twiml.toString());
  }
});

// ===== Cron jobs =====

// Daily summary 08:00
cron.schedule('0 8 * * *', async () => {
  try {
    console.log('Running daily summary job at 08:00');
    if (!TO_WHATSAPP) return;
    const resSum = await pool.query(`
      SELECT phone, COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE -amount END),0) AS balance
      FROM transactions GROUP BY phone
    `);
    for (const row of resSum.rows) {
      const phone = row.phone;
      const bal = parseFloat(row.balance || 0).toFixed(2);
      const msg = `${vegetaReplyBase()} Resumo diário para ${phone}: Saldo R$${bal}`;
      await sendWhatsApp(TO_WHATSAPP, msg);
    }
  } catch (e) {
    console.error('Daily summary job error', e);
  }
}, { timezone: 'America/Sao_Paulo' });

// Hourly loan reminders
cron.schedule('0 * * * *', async () => {
  try {
    console.log('Running hourly loan reminder job');
    const resLoans = await pool.query(`SELECT id,phone,amount,due_at,paid FROM loans WHERE paid=false AND due_at IS NOT NULL`);
    const now = new Date();
    for (const loan of resLoans.rows) {
      const due = new Date(loan.due_at);
      const diffDays = Math.ceil((due - now)/(1000*60*60*24));
      if (diffDays <= 1) {
        const msg = `${vegetaReplyBase()} ${randomVegeta('reminder')} Empréstimo R$${parseFloat(loan.amount).toFixed(2)} vence em ${diffDays} dia(s).`;
        await sendWhatsApp(loan.phone, msg);
      }
    }
  } catch (e) {
    console.error('Loan reminder job error', e);
  }
}, { timezone: 'America/Sao_Paulo' });

// Daily bills reminders 09:00
cron.schedule('0 9 * * *', async () => {
  try {
    console.log('Running daily bills reminder job at 09:00');
    const resBills = await pool.query(`SELECT id,phone,description,amount,due_date FROM bills WHERE due_date IS NOT NULL`);
    const now = new Date();
    for (const bill of resBills.rows) {
      const due = new Date(bill.due_date);
      const diffDays = Math.ceil((due - now)/(1000*60*60*24));
      if (diffDays >= 0 && diffDays <= 2) {
        const msg = `${vegetaReplyBase()} Lembrete: ${bill.description} de R$${parseFloat(bill.amount).toFixed(2)} vence em ${diffDays} dia(s).`;
        await sendWhatsApp(bill.phone, msg);
      }
    }
  } catch (e) {
    console.error('Bills reminder job error', e);
  }
}, { timezone: 'America/Sao_Paulo' });

// ===== Start app =====
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Peartree Vegeta running on port ${PORT}`);
  });
}).catch(err => {
  console.error('DB init failed', err);
  process.exit(1);
});
