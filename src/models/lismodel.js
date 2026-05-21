import mongoose, {Schema} from "mongoose"

const lisschema = new Schema({
    lisData: {
        type: Object,
        default: null
    }
}, {
    timestamps: true
});

const lisdata = mongoose.model("lisdata", lisschema)

export {lisdata}