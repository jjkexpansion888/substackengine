This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Local setup

This app talks to PostgreSQL through Prisma. A fresh clone starts fine, but any page that touches the database fails until `DATABASE_URL` is configured.

1. Install dependencies — this also generates the Prisma client:

   ```bash
   npm install
   ```

2. Create your local env file and fill in `DATABASE_URL` (local Docker postgres, [Supabase](https://supabase.com), or [Neon](https://neon.tech) all work):

   ```bash
   cp .env.example .env
   ```

3. Create the database schema:

   ```bash
   npm run db:push
   ```

4. Start the dev server:

   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Troubleshooting

If the browser shows the generic `Application error: a server-side exception` page, `DATABASE_URL` is usually missing or unreachable. The real error is in the terminal running `npm run dev` — look for `PrismaClientInitializationError` there. After changing `DATABASE_URL`, restart the dev server.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
