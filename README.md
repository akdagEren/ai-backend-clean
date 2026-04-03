# Pamuk's Shoes AI Backend

Bu servis mevcut PHP tabanli e-ticaret sitesine dokunmadan, harici AI ozellikleri eklemek icin tasarlandi.

## Kurulum

```bash
cd ai-backend
npm install
copy .env.example .env
npm run dev
```

## Endpointler

- `POST /api/chat`
- `POST /api/recommend`
- `POST /api/size-advice`
- `GET /api/search?q=sik+siyah+kislik+cizme`
- `POST /api/image-search`
- `POST /api/admin`
- `GET|POST /whatsapp/webhook`

## Notlar

- OpenAI API anahtari yoksa sistem yedek kurallarla calismaya devam eder.
- WhatsApp Cloud API icin `.env` icindeki Meta alanlarini doldurmaniz gerekir.
- Widget ve admin panel varsayilan olarak `http://localhost:3101` tabanini kullanir.
