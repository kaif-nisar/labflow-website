import mongoose, {Schema} from "mongoose";

const addLabSchema = new Schema({
    LabName: {
        type: String,
        required: true
    },
    LabAddress: {
        type: String
    },
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant', // Reference to the tenant
        required: true
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Reference to the creator
}, {
    timestamps: true
})

const bookingAddLab = mongoose.model('booking-time-add-lab', addLabSchema)

export {
    bookingAddLab
}