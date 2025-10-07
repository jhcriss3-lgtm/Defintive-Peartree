Peartree Vegeta - WhatsApp financial bot (Supabase/Postgres version)

Included files:
- index.js        : main bot code (express + twilio + pg + cron)
- package.json    : dependencies and start script
- .env.example    : example env file (copy to .env and fill your secrets)
- README.md       : this file

Quick start (Render):
1. Create a new Web Service on Render connected to this repository (or upload files).
2. In Render service settings set:
   - Build Command: npm install
   - Start Command: npm start
3. In Render Environment variables, paste values from .env (DATABASE_URL, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP, TO_WHATSAPP).
   IMPORTANT: Replace [YOUR-PASSWORD] in DATABASE_URL with your real DB password.
4. Deploy. After deploy finishes, copy the service URL (e.g. https://your-app.onrender.com).
5. In Twilio Console -> WhatsApp Sandbox set "When a message comes in" to: https://YOUR_RENDER_URL/webhook (Method: POST).
6. Activate sandbox from your phone (send "join <code>" to Twilio sandbox number).
7. Test commands from your WhatsApp:
   - entrada 1000 salario
   - saida 200 mercado
   - relatorio
   - emprestimo 150
   - pagar
   - fatura adicionar 15 Nubank 350
   - faturas

Notes:
- The .env.example contains the DB URL you provided with placeholder [YOUR-PASSWORD]. Replace it with your actual DB password.
- Cron jobs: daily summary at 08:00 (America/Sao_Paulo), hourly loan reminder, daily bills reminder at 09:00.
- Twilio must be configured with correct credentials to send outgoing WhatsApp messages.
