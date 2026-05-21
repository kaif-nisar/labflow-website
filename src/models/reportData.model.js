import mongoose, { Schema } from "mongoose"

const tabledataSchema = new Schema({
    reference: String,
    testName: String,
    unit: String,
    value: String,
    referenceType: {
        type: String,
        default: "numeric"
    },
    isAbnormal: {
        type: Boolean,
        default: false
    },
    isBold: {
        type: Boolean,
        default: false
    },
    remark: String,
    details: String,
    isDocumented: {
        type: Boolean,
        default: false
    },
    pagebreak:{
        type: Boolean,
        default: false
    }
})

const categoryAndTestSchema = new Schema({
    category: String,
    advice: String,
    interpretation: String,
    notes: String,
    remarks: String,
    title: String,
    tests: [tabledataSchema]
})

const doctorSnapshotSchema = new Schema({
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
}, { _id: false })

const reportActionCountersSchema = new Schema({
    viewPdf: {
        type: Number,
        default: 0
    },
    downloadPdf: {
        type: Number,
        default: 0
    },
    email: {
        type: Number,
        default: 0
    },
    sms: {
        type: Number,
        default: 0
    },
    whatsappOpen: {
        type: Number,
        default: 0
    },
    printDialog: {
        type: Number,
        default: 0
    }
}, { _id: false })

const reportActionHistoryEntrySchema = new Schema({
    actionId: {
        type: String,
        default: ""
    },
    clickedAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false })

const reportActionHistorySchema = new Schema({
    viewPdf: {
        type: [reportActionHistoryEntrySchema],
        default: () => []
    },
    downloadPdf: {
        type: [reportActionHistoryEntrySchema],
        default: () => []
    },
    email: {
        type: [reportActionHistoryEntrySchema],
        default: () => []
    },
    sms: {
        type: [reportActionHistoryEntrySchema],
        default: () => []
    },
    whatsappOpen: {
        type: [reportActionHistoryEntrySchema],
        default: () => []
    },
    printDialog: {
        type: [reportActionHistoryEntrySchema],
        default: () => []
    }
}, { _id: false })

const reportData = new Schema({
    tenantId: {
        type: mongoose.Types.ObjectId
    },
    createdBy: {
        type: mongoose.Types.ObjectId
    },
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
        required: true
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
    reg_id: {
        type: String
    },
    signedBy: {
        type: String
    },
    CategoryAndTest: [categoryAndTestSchema],
    collectedOn: String,
    receivedOn: String,
    reportedOn: String,
    categorizedPDF: Boolean,
    MoreDetails: String,
    uniquetestArray: [String],
    signOff: {
        type: Boolean,
        default: false
    },
    isdocumented : {
        type: Boolean,
        default: false
    },
    actionCounters: {
        type: reportActionCountersSchema,
        default: () => ({})
    },
    actionHistory: {
        type: reportActionHistorySchema,
        default: () => ({})
    },
    lastEmailedAt: {
        type: Date
    },
    lastEmailedTo: {
        type: String,
        default: ""
    }
},
    { timestamps: true }
)

const reports = mongoose.model("report", reportData);

export { reports };

