# Smart Financial Literacy Tool - Backend

## Setup Instructions

1. Install dependencies:
```bash
npm install
```

2. Configure MongoDB:
   - Open `.env` file
   - Replace `<db_password>` in MONGODB_URI with your actual MongoDB Atlas password
   - Update JWT_SECRET with a secure random string

3. Start the server:
```bash
npm run dev
```

The server will run on http://localhost:5000

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Financial Profile
- `POST /api/financial/profile` - Submit/Update financial profile (requires auth)
- `GET /api/financial/profile` - Get user profile and recommendations (requires auth)

## Environment Variables
- `PORT` - Server port (default: 5000)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens
