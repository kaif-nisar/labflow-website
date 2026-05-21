import mongoose, {Schema} from "mongoose"

const doctorSchema = new Schema({
    displayName: {
        type: String,
        trim: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        default: ""
    },
    firstName: {
        type: String,
        trim: true,
        default: "",
        validate: {
            validator: function(value) {
                // Only validate if not a system default doctor
                if (this.isSystemDefault) return true;
                return Boolean(String(value || "").trim());
            },
            message: 'First name is required for non-system doctors'
        }
    },
    lastName: {
        type: String,
        trim: true,
        default: "",
        validate: {
            validator: function(value) {
                // Only validate if not a system default doctor
                if (this.isSystemDefault) return true;
                return Boolean(String(value || "").trim());
            },
            message: 'Last name is required for non-system doctors'
        }
    },
    specialization: {
        type: String,
        trim: true,
        default: "",
        validate: {
            validator: function(value) {
                // Only validate if not a system default doctor
                if (this.isSystemDefault) return true;
                return Boolean(String(value || "").trim());
            },
            message: 'Specialization is required for non-system doctors'
        }
    },
    DOB: {
        type: Date,
    },
    gender: {
        type: String,
        enum: ["male", "female", "other"],
        default: "other",
        validate: {
            validator: function(value) {
                // Only validate if not a system default doctor
                if (this.isSystemDefault) return true;
                return ["male", "female", "other"].includes(String(value || "").toLowerCase());
            },
            message: 'Gender must be male, female, or other'
        }
    },
    remarks: {
        type: String,
        default: ""
    },
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant', // Reference to the tenant
        required: true
    },
    address: {
        type: String
    },
    isSystemDefault: {
        type: Boolean,
        default: false
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Reference to the creator
}, {
    timestamps: true
});

doctorSchema.index(
    { tenantId: 1, createdBy: 1, isSystemDefault: 1 },
    {
        unique: true,
        partialFilterExpression: { isSystemDefault: true }
    }
);

doctorSchema.index(
    { tenantId: 1, createdBy: 1, email: 1 },
    {
        unique: true,
        partialFilterExpression: {
            email: { $type: "string", $gt: "" }
        }
    }
);

const doctors = mongoose.models.doctor || mongoose.model("doctor", doctorSchema)

export {doctors}
