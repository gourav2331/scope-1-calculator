# Sustally Scope 1 Calculator

Cement-first Scope 1 calculator built with Next.js and Payload.

## Product Direction

- Scope 1 only.
- Universal core: stationary combustion, mobile combustion, fugitive emissions.
- Sector packs: start with cement, then add other sectors one by one.
- Methodology spine: GHG Protocol activity-data logic, IPCC process methodology, versioned emission factors, and clear factor-source provenance.
- Sustally UI: light and dark modes, purple accent, operational dashboard feel.

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Payload admin will be available at `/admin` once `DATABASE_URI` and `PAYLOAD_SECRET` are configured.

## First MVP

The current first screen is the cement Scope 1 workflow:

- Stationary combustion fuel use.
- Mobile combustion fuel use.
- Fugitive refrigerant/SF6 releases.
- Cement process emissions from clinker calcination.
- Scope 1 total and cement intensity.
- Row-level source, version, and formula display for assurance.
