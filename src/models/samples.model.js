import mongoose, { Schema } from "mongoose"

const barcodeSchema = new Schema({
    barcode: {
        type: String
    },
    testandpannelArray: {
        type: Array
    },
    sampleType: {
        type: String
    },
    testIds: [
        {
            id: {
                type: mongoose.Types.ObjectId
            },
            collectionName: String
        },
    ]
},
    { timestamps: true } // Enable createdAt and updatedAt
)
const pannelSchema = new Schema({
    tenantId: {
        type: mongoose.Types.ObjectId,
        ref: 'User'
    },
    bookingId: {
        type: String,
    },
    barcodes: [barcodeSchema]
},
    { timestamps: true }
)

const acceptedBarcode = mongoose.model("acceptedBarcode", pannelSchema)

export { acceptedBarcode }