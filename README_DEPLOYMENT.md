# Transcription App - Railway Deployment Guide

## Prerequisites

1. GitHub account (for private repository)
2. Railway account (https://railway.app)
3. Clerk account (https://clerk.com)
4. OpenAI API key

## Step 1: Set up Clerk Authentication

1. Sign up at https://clerk.com
2. Create a new application
3. Note down your:
   - `CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
4. In Clerk Dashboard, configure:
   - Allowed redirect URLs: Add your Railway domain
   - Enable email/password authentication (or your preferred method)

## Step 2: Create GitHub Private Repository

```bash
cd /Volumes/Container/whisper-app

# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - secure transcription app"

# Create private repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/transcription-app-private.git
git branch -M main
git push -u origin main
```

## Step 3: Deploy to Railway

### Via GitHub Integration:

1. Go to https://railway.app/new
2. Select "Deploy from GitHub repo"
3. Connect your GitHub account
4. Select your private repository
5. Railway will automatically deploy

### Via Railway CLI:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create new project
railway init

# Link to existing project (if needed)
railway link

# Deploy
railway up
```

## Step 4: Configure Environment Variables in Railway

In Railway dashboard, add these environment variables:

```
OPENAI_API_KEY=your-openai-api-key
CLERK_PUBLISHABLE_KEY=pk_test_your-clerk-key
CLERK_SECRET_KEY=sk_test_your-clerk-secret
NODE_ENV=production
ALLOWED_ORIGINS=https://your-app.railway.app
```

## Step 5: Set up Persistent Storage

In Railway dashboard:
1. Go to your service
2. Click "Settings" → "Volumes"
3. Add a volume mount at `/app/uploads`
4. This ensures transcriptions persist across deployments

## Step 6: Configure Custom Domain (Optional)

1. In Railway settings, add your custom domain
2. Update DNS records as instructed
3. Update `ALLOWED_ORIGINS` environment variable

## Security Notes

- Never commit `.env` files
- API keys are stored as Railway environment variables
- All endpoints are protected with Clerk authentication
- Rate limiting prevents abuse
- File uploads are validated and sanitized

## Monitoring

- Health check: `https://your-app.railway.app/health`
- Railway provides logs and metrics in dashboard
- Set up alerts for errors or high usage

## Troubleshooting

1. **FFmpeg not found**: Docker image includes FFmpeg, should work automatically
2. **Authentication errors**: Check Clerk keys and domain configuration
3. **Upload failures**: Verify volume is mounted correctly
4. **Transcription errors**: Check OpenAI API key and quota

## Local Development

```bash
# Copy .env.example to .env
cp .env.example .env

# Edit .env with your keys
# Run locally
npm install
npm start
```