import { SuperAdmin } from "../models/superAdmin.model.js";
import Connect_DB from "../db/index.js";

/**
 * Reset Database - Delete all SuperAdmins and recreate default one
 * Use this if login is failing and you need to reset credentials
 */
export const resetDatabase = async () => {
    try {
        console.log("🔄 Starting database reset...");

        // Connect to database
        await Connect_DB();
        console.log("✅ Connected to MongoDB");

        // Count current admins
        const count = await SuperAdmin.countDocuments();
        console.log(`📊 Found ${count} super admin(s) in database`);

        if (count > 0) {
            // Delete all admins
            const deleteResult = await SuperAdmin.deleteMany({});
            console.log(`🗑️  Deleted ${deleteResult.deletedCount} super admin(s)`);
        }

        // Create fresh default admin
        const username = "admin";
        const email = "admin@labflow.local";
        const password = "Admin@123";
        const fullName = "Local Super Admin";
        const phoneNo = "9999999999";

        const newAdmin = await SuperAdmin.create({
            username,
            email,
            password,
            fullName,
            phoneNo,
            role: "superAdmin",
        });

        console.log("✅ SUCCESS! Default super admin recreated:");
        console.log(`   📝 Username: ${username}`);
        console.log(`   📧 Email: ${email}`);
        console.log(`   🔑 Password: ${password}`);
        console.log(`   🆔 ID: ${newAdmin._id}`);

        return {
            success: true,
            message: "Database reset completed successfully",
            admin: {
                username,
                email,
                password,
            },
        };
    } catch (error) {
        console.error("❌ Error during database reset:", error.message);
        console.error(error);
        throw error;
    }
};
