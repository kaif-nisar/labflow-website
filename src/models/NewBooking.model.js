import mongoose, { Schema } from "mongoose"

const tableSchema = new Schema({
    typeOfSample: {
        type: String
    },
    barcodeId: {
        type: String,
        required: true
    },
    testName: {
        type: String
    },
    ids: [
        {
            id: {
                type: mongoose.Types.ObjectId
            },
            collectionName: String
        },
    ]
})

const selectedBookingItemSchema = new Schema(
    {
        itemId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        itemType: {
            type: String,
            enum: ['test', 'panel', 'package'],
            required: true
        },
        itemName: {
            type: String,
            required: true
        },
        shortName: {
            type: String,
            default: ""
        },
        sampleTypes: {
            type: [String],
            default: []
        },
        price: {
            type: Number,
            required: true
        },
        basePrice: {
            type: Number,
            default: 0
        },
        mrpPrice: {
            type: Number,
            default: 0
        },
        rateSource: {
            type: String,
            enum: ['self', 'doctor-rate-card', 'catalog-default'],
            default: 'self'
        },
        selectedViaGroupId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },
        selectedViaGroupName: {
            type: String,
            default: ""
        }
    },
    { _id: false }
)

const doctorSnapshotSchema = new Schema(
    {
        displayName: {
            type: String,
            default: ""
        },
        email: {
            type: String,
            default: ""
        },
        firstName: {
            type: String,
            default: ""
        },
        lastName: {
            type: String,
            default: ""
        },
        source: {
            type: String,
            default: "snapshot"
        }
    },
    { _id: false }
)

const TestBookingSchema = new Schema({
    bookingId: {
        type: String,
        unique: true,
        required: true
    },
    date: {
        type: Date
    },
    time: {
        type: String
    },
    courierName: {
        type: String
    },
    courierId: {
        type: String
    },
    patientName: {
        type: String,
        required: true
    },
    year: {
        type: String
    },
    gender: {
        type: String,
        required: true
    },
    patientPhone: {
        type: String,
    },
    doctorName: {
        type: String
    },
    labName: {
        type: String
    },
    franchisee: {
        type: String
    },
    clinicalHistory: {
        type: String
    },
    file: {
        type: String
    },
    editHistory: [
        {
            fieldName: String,              // kaunsi field change hui
            oldValue: mongoose.Schema.Types.Mixed, // pehle kya tha
            newValue: mongoose.Schema.Types.Mixed, // ab kya hai
            editedById: { type: Schema.Types.ObjectId, ref: 'User' },
            editedByName: String,
            editedAt: { type: Date, default: Date.now }
        }
    ],
    tableData: [tableSchema],
    selectedItems: {
        type: [selectedBookingItemSchema],
        default: []
    },
    total: {
        type: Number,
        required: true
    },
    subFranchisee: {
        type: String
    },
    subFranchiseeId: {
        type: Schema.Types.ObjectId
    },
    savedDoctor: {
        type: String
    },
    savedDoctorId: {
        type: Schema.Types.ObjectId,
        ref: "doctor"
    },
    savedDoctorEmail: {
        type: String,
        default: ""
    },
    savedDoctorMeta: {
        type: doctorSnapshotSchema,
        default: () => ({})
    },
    savedLab: {
        type: String
    },
    savedLabId: {
        type: Schema.Types.ObjectId
    },
    status: {
        type: String,
        default: 'On Hold'
    },
    isreportready: {
        type: Boolean,
        default: false
    },
    discountamount: {
        type: Number,
        default: 0
    },
    discountunit: {
        type: Number,
        default: 0
    },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Reference to the creator
    createdbyuser: { type: String, ref: 'User' }, // Reference to the creator
    commissions: [
        {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            role: { type: String, enum: ['superFranchisee', 'franchisee', 'subFranchisee'] },
            amount: { type: Number },
            createdAt: { type: Date, default: Date.now },
        },
    ],
    createdAt: { type: Date, default: Date.now }
}, {
    timestamps: true
})

const newBooking = mongoose.model("testBooking", TestBookingSchema)

export { newBooking }
