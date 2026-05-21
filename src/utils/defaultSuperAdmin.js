import { SuperAdmin } from "../models/superAdmin.model.js";

const normalizeValue = (value, fallback = "") => {
    const normalized = String(value || "").trim();
    return normalized || fallback;
};

export const ensureDefaultSuperAdmin = async () => {
    try {
        const existingSuperAdminCount = await SuperAdmin.countDocuments();

        if (existingSuperAdminCount > 0) {
            console.log(`✅ Default super admin already exists (${existingSuperAdminCount} admin(s) found)`);
            return {
                created: false,
                reason: "existing-super-admin-detected",
            };
        }

        const username = normalizeValue(process.env.DEFAULT_SUPERADMIN_USERNAME, "admin").toLowerCase();
        const email = normalizeValue(process.env.DEFAULT_SUPERADMIN_EMAIL, "admin@labflow.local").toLowerCase();
        const fullName = normalizeValue(process.env.DEFAULT_SUPERADMIN_FULLNAME, "Local Super Admin");
        const phoneNo = normalizeValue(process.env.DEFAULT_SUPERADMIN_PHONE, "9999999999");
        const password = normalizeValue(process.env.DEFAULT_SUPERADMIN_PASSWORD, "Admin@123");

        const existingMatchingUser = await SuperAdmin.findOne({
            $or: [{ username }, { email }],
        });

        if (existingMatchingUser) {
            console.log(`⚠️  Super admin with username '${username}' or email '${email}' already exists`);
            return {
                created: false,
                reason: "matching-super-admin-already-exists",
            };
        }

        console.log(`🔐 Creating default super admin with username: ${username}`);

        // Create super admin - password will be hashed by pre-save hook
        const createdSuperAdmin = await SuperAdmin.create({
            username,
            email,
            fullName,
            password,
            phoneNo,
            role: "superAdmin",
        });

        console.log("✅ Default local super admin created successfully for offline desktop use.");
        console.log(`  📝 Username: ${username}`);
        console.log(`  📧 Email: ${email}`);
        console.log(`  🔑 Password: ${password}`);
        console.log(`  🆔 User ID: ${createdSuperAdmin._id}`);

        return {
            created: true,
            userId: String(createdSuperAdmin._id),
            username,
            email,
        };
    } catch (error) {
        console.error("❌ Error creating default super admin:", error.message);
        console.error("Full error:", error);
        throw error;
    }
};
