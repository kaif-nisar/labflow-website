module.exports = {
  apps: [
    {
      name: "labflowlis",
      script: "app.js",
      instances: 1,
      exec_mode: "fork",

      watch: false,

      env: {
        // Server
        PORT: 4000,
        NODE_ENV: "production",
        NODE_OPTIONS: "--max-old-space-size=1024",

        // Database
        MONGODB_URI:
          "mongodb+srv://ahadsidd5:Ahad9520@cluster0.uiadu.mongodb.net/myfranchisee_super_admin",

        // Token Secrets
        SUPER_ADMIN_ACCESS_TOKEN_SECRET:
          "your_super_admin_access_token_secret",

        SUPER_ADMIN_REFRESH_TOKEN_SECRET:
          "your_super_admin_refresh_token_secret",

        ACCESS_TOKEN_EXPIRY: "1d",
        REFRESH_TOKEN_EXPIRY: "10d",

        // Email
        EMAIL_USER: "kaifquest786@gmail.com",
        EMAIL_PASS: "tbgljldaqkvzafvg",

        // Cloudinary
        CLOUD_API_KEY: "684341464322826",
        CLOUD_API_SECRET: "-eFiHPjuRigCGtNmRbmJCUrXaio",
        CLOUDINARY_NAME: "dbpdu0lpg",

        // URLs
        PUBLIC_SITE_URL: "https://labflowlis.com",
        SITE_URL: "https://labflowlis.com",
        CANONICAL_REDIRECT_ENABLED: "false",

        // CORS
        CORS_ORIGIN: "https://labflowlis.com"
      }
    }
  ]
};
