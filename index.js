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

// PostgreSQL connection corrected for Render + Supabase
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Twilio client
const client = (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) 
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) 
  : null;

// Initialize database tables
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

// Vegeta-style messaging
function vegetaReplyBase() { return 'Peartree Vegeta: '; }

function randomVegeta(type) {
  const phrases = {
    spend: ["Verme insolente! Patético desperdício!", "Hmph! Gastou de novo? Você não aprende."],
    income: ["O miserável é um gênio... por enquanto.", "Hmph, dinheiro? Use com sabedoria, verme."],
    loan: ["Você quer um empréstimo? Cuidado, inseto.", "Toma o dinheiro, e pague antes que eu volte."],
    reminder: ["Lembrete: cobre essa dívida, miserável.", "Hmph — não esqueça de pagar o que deve."],
    default: ["Hmph! Não entendi, fale direito, inseto."]
  };
  const arr = phrases[type] || phrases.default;
  return arr[Math.floor(Math.random()*arr.length)];
}

async function getBalance(phone) {
  const res = await pool.query(`
    SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE -amount END),0) AS balance
    FROM transactions WHERE phone = $1
  `, [phone]);
  return parseFloat(res.rows[0].balance || 0);
}

async function sendWhatsApp(to, body) {
  if (!client) return console.error('Twilio client not configured. Skipping send:', body);
  try {
    const msg = await client.messages.create({
      from: TWILIO_WHATSAPP,
      to,
      body
    });
    console.log('Sent WhatsApp message SID:', msg.sid);
  } catch (e) {
    console.error('Error sending WhatsApp message:', e.message || e);
  }
}

// Command parser
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

// WhatsApp webhook
app.post('/webhook', async (req, res) => {
  try {
    const from = req.body.From || 'whatsapp:unknown';
    const body = req.body.Body || '';
    const phone = from;
    const parsed = parseCommand(body);

    let reply = vegetaReplyBase();
    if (parsed.cmd === 'income') {
      const amount = extractAmount(parsed.text) || 0;
      await pool.query(`INSERT INTO transactions (phone,type,amount,category,note) VALUES ($1,'income',$2,'income',$3)`,
        [phone, amount, parsed.text]);
      reply += randomVegeta('income') + ` (+R$${amount.toFixed(2)})`;
    } else if (parsed.cmd === 'expense') {
      const amount = extractAmount(parsed.text) || 0;
      await pool.query(`INSERT INTO transactions (phone,type,amount,category,note) VALUES ($1,'expense',$2,'expense',$3)`,
        [phone, amount, parsed.text]);
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
      let income=0, expense=0;
      resTx.rows.forEach(r=> { if(r.type==='income') income=parseFloat(r.total); if(r.type==='expense') expense=parseFloat(r.total); });
      const bal = income - expense;
      reply += `Relatório mês: Entradas R$${income.toFixed(2)}, Saídas R$${expense.toFixed(2)}, Saldo R$${bal.toFixed(2)}.`;
    } else if (parsed.cmd === 'loan') {
      const amount = extractAmount(parsed.text) || 0;
      const due = new Date(Date.now()+3*24*60*60*1000);
      await pool.query(`INSERT INTO loans (phone,amount,due_at) VALUES ($1,$2,$3)`, [phone, amount, due]);
      reply += randomVegeta('loan') + ` Empréstimo de R$${amount.toFixed(2)} registrado. Vence em ${due.toISOString().slice(0,10)}.`;
    } else if (parsed.cmd === 'payloan') {
      const loanRes = await pool.query(`SELECT * FROM loans WHERE phone=$1 AND paid=false ORDER BY created_at LIMIT 1`, [phone]);
      if(loanRes.rows.length===0) reply+='Nenhum empréstimo pendente encontrado.';
      else {
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
      if (day && /^\d{1,2}$/.test(day)) { const d=new Date(); d.setDate(parseInt(day)); due_date=d.toISOString().slice(0,10); }
      await pool.query(`INSERT INTO bills (phone,description,amount,due_date) VALUES ($1,$2,$3,$4)`,
        [phone, desc, amount, due_date]);
      reply += `Fatura cadastrada: ${desc} R$${amount.toFixed(2)} vence em ${due_date || 'data indefinida'}.`;
    } else if (parsed.cmd === 'listbills') {
      const bres = await pool.query(`SELECT id,description,amount,due_date FROM bills WHERE phone=$1 ORDER BY due_date NULLS LAST`, [phone]);
      if(bres.rows.length===0) reply+='Nenhuma fatura encontrada.';
      else reply+='Faturas:\n'+bres.rows.map(r=>`#${r.id} ${r.description} R$${parseFloat(r.amount).toFixed(2)} vence ${r.due_date||'---'}`).join('\n');
    } else reply += randomVegeta('default');

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(reply);
    res.type('text/xml').send(twiml.toString());

  } catch(err) {
    console.error('Webhook error', err);
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message('Erro interno no Peartree Vegeta.');
    res.type('text/xml').send(twiml.toString());
  }
});

// Cron jobs (loans, bills, daily summary) remain the same as your version
// ... keep your cron schedules

initDb().then(()=> {
  app.listen(PORT, ()=> {
    console.log(`Peartree Vegeta running on port ${PORT}`);
  });
}).catch(err=> {
  console.error('DB init failed', err);
  process.exit(1);
});
