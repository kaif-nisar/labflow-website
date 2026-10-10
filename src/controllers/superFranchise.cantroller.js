import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
// import { SuperFranchisee } from "../models/superFranchisee.model.js";
// import { Franchiseedb } from "../models/franchisee.model.js";
import { User } from "../models/user.model.js"
import { Ledger } from "../models/ledger.model.js"
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Tenant } from "../models/tenant.model.js";
import { storeLocalFile } from "../utils/localStorage.js";

// fetch data for retrive or update and adit

const superFranchiseeUpdate = asyncHandler(async (req, res) => {
    try {
        let _id = req.query._id || req.body?._id || req.user?._id;
        if (!_id) {
            throw new ApiError(400, "User ID is required");
        }
        _id = _id.toString().trim();

        if (!mongoose.Types.ObjectId.isValid(_id)) {
            throw new ApiError(400, "Invalid ObjectId format");
        }

        const sFranchisee = await User.findById(_id)
            .populate("tenantId")
            .select("-password -refreshToken");

        if (!sFranchisee) {
            throw new ApiError(404, "User not found");
        }
        return res.status(200).json(
            new ApiResponse(200, sFranchisee, "User fetched successfully")
        );
    } catch (error) {
        throw new ApiError(error.statusCode || 500, error.message || "Something went wrong user not found");
    }
});

// franchisee update by id 
const sfUpdate = asyncHandler(async (req, res) => {
    let _id = req.query._id || req.body?._id || req.user?._id;
    if (!_id) {
        throw new ApiError(400, "User ID is required");
    }
    _id = _id.toString().trim();

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(_id)) {
        throw new ApiError(400, "Invalid ObjectId format");
    }

    // Find the superfranchisee
    const superFranchisee = await User.findById(_id);
    if (!superFranchisee) {
        throw new ApiError(404, "User not found");
    }

    const {
        fullName,
        email,
        username,
        password,
        state,
        city,
        district,
        postOffice,
        pinCode,
        address,
        phoneNo,
        isActive,
        clinicName
    } = req.body;

    // Check if email already exists (only if changed and valid)
    if (email && typeof email === "string" && email.trim() !== "") {
        const normalizedEmail = email.toLowerCase().trim();
        const currentEmail = (superFranchisee.email || "").toLowerCase().trim();
        if (normalizedEmail !== currentEmail) {
            const existingEmail = await User.findOne({ email: normalizedEmail });
            if (existingEmail && existingEmail._id.toString() !== _id) {
                throw new ApiError(400, "Email already registered. Please use a different email.");
            }
        }
    }

    // Check if username already exists (only if changed and valid)
    if (username && typeof username === "string" && username.trim() !== "") {
        const normalizedUsername = username.toLowerCase().trim();
        const currentUsername = (superFranchisee.username || "").toLowerCase().trim();
        if (normalizedUsername !== currentUsername) {
            const existingUsername = await User.findOne({ username: normalizedUsername });
            if (existingUsername && existingUsername._id.toString() !== _id) {
                throw new ApiError(400, "Username already taken. Please use a different username.");
            }
        }
    }

    // Check if phone already exists (only if changed and valid)
    if (phoneNo !== undefined && phoneNo !== null && phoneNo.toString().trim() !== "") {
        const normalizedPhone = phoneNo.toString().trim();
        const currentPhone = (superFranchisee.phoneNo || "").toString().trim();
        if (normalizedPhone !== currentPhone) {
            const existingPhone = await User.findOne({ phoneNo: normalizedPhone });
            if (existingPhone && existingPhone._id.toString() !== _id) {
                throw new ApiError(400, "Phone number already registered. Please use a different phone number.");
            }
        }
    }

    // Prepare object to update
    const updateData = {};
    if (fullName !== undefined) updateData.fullName = fullName.trim();
    if (email !== undefined && email.trim() !== "") updateData.email = email.toLowerCase().trim();
    if (username !== undefined && username.trim() !== "") updateData.username = username.toLowerCase().trim();
    if (state !== undefined) updateData.state = state;
    if (city !== undefined) updateData.city = city;
    if (district !== undefined) updateData.district = district;
    if (postOffice !== undefined) updateData.postOffice = postOffice;
    if (pinCode !== undefined) updateData.pinCode = pinCode;
    if (address !== undefined) updateData.address = address;
    if (phoneNo !== undefined) updateData.phoneNo = phoneNo;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (clinicName !== undefined) updateData.clinicName = clinicName;
    if (req.body.canManageOverdraft !== undefined) updateData.canManageOverdraft = req.body.canManageOverdraft;

    if (password && typeof password === "string" && password.trim() !== "") {
        updateData.password = await bcrypt.hash(password.trim(), 10);
    }

    // Find associated Tenant (either via tenantId or adminDetails.userId)
    let tenant = null;
    if (superFranchisee.tenantId) {
        tenant = await Tenant.findById(superFranchisee.tenantId);
    }
    if (!tenant) {
        tenant = await Tenant.findOne({ "adminDetails.userId": superFranchisee._id });
    }

    // Handle branding configuration
    let brandingData = null;
    if (req.body.branding) {
        if (typeof req.body.branding === "string") {
            try {
                brandingData = JSON.parse(req.body.branding);
            } catch (err) {
                brandingData = {};
            }
        } else if (typeof req.body.branding === "object") {
            brandingData = req.body.branding;
        }
    }

    // Direct branding fields if sent individually
    const directBrandingFields = ["brandType", "labHeading", "labSlogan", "bgColor", "textColor", "sloganColor", "fontSize", "sloganSize", "fontFamily", "textAlign", "borderWidth", "borderColor"];
    let hasDirectBranding = false;
    const directBranding = {};
    for (const key of directBrandingFields) {
        if (req.body[key] !== undefined) {
            hasDirectBranding = true;
            if (key === "fontSize" || key === "sloganSize" || key === "borderWidth") {
                directBranding[key] = Number(req.body[key]) || 0;
            } else {
                directBranding[key] = req.body[key];
            }
        }
    }
    if (hasDirectBranding) {
        brandingData = { ...(brandingData || {}), ...directBranding };
    }

    const tenantUpdates = {};
    if (tenant) {
        if (tenant.status === "true" || tenant.status === true) {
            tenantUpdates.status = "active";
        }
        if (brandingData) {
            updateData.branding = brandingData;
            const currentBranding = tenant.branding?.toObject ? tenant.branding.toObject() : (tenant.branding || {});
            tenantUpdates.branding = { ...currentBranding, ...brandingData };
        }
    }

    // Persist profile and branding assets to the local uploads folder
    if (req.files) {
        if (req.files.logo && req.files.logo.length > 0) {
            const logoResult = await storeLocalFile(req.files.logo[0].path, {
                category: "logos",
                fileName: req.files.logo[0].originalname,
            });
            if (logoResult?.secure_url && tenant) {
                tenantUpdates.logo = logoResult.secure_url;
                tenantUpdates.logopublicid = logoResult.public_id;
                if (!tenantUpdates.branding) {
                    tenantUpdates.branding = tenant.branding?.toObject ? tenant.branding.toObject() : (tenant.branding || {});
                }
                tenantUpdates.branding.brandType = "image";
            }
        }

        if (req.files.profileImage && req.files.profileImage.length > 0) {
            const profileImageResult = await storeLocalFile(req.files.profileImage[0].path, {
                category: "profiles",
                fileName: req.files.profileImage[0].originalname,
            });
            if (profileImageResult?.secure_url) {
                updateData.profileimage = profileImageResult.secure_url;
                updateData.profileimagepublicid = profileImageResult.public_id;
            }
        }

        if (req.files.nablLogo && req.files.nablLogo.length > 0) {
            const nablLogoResult = await storeLocalFile(req.files.nablLogo[0].path, {
                category: "logos",
                fileName: req.files.nablLogo[0].originalname,
            });
            if (nablLogoResult?.secure_url) {
                updateData.nabllogo = nablLogoResult.secure_url;
                updateData.nabllogopublicid = nablLogoResult.public_id;
            }
        }
    }

    // Explicit removal flags
    if (req.body.removeLogo === "true" || req.body.removeLogo === true) {
        if (tenant) {
            tenantUpdates.logo = "";
            tenantUpdates.logopublicid = "";
            if (!tenantUpdates.branding) {
                tenantUpdates.branding = tenant.branding?.toObject ? tenant.branding.toObject() : (tenant.branding || {});
            }
            if (tenantUpdates.branding?.brandType === "image") {
                tenantUpdates.branding.brandType = tenantUpdates.branding.labHeading ? "text" : "none";
            }
        }
    }
    if (req.body.removeProfileImage === "true" || req.body.removeProfileImage === true) {
        updateData.profileimage = "";
        updateData.profileimagepublicid = "";
    }
    if (req.body.removeNablLogo === "true" || req.body.removeNablLogo === true) {
        updateData.nabllogo = "";
        updateData.nabllogopublicid = "";
    }

    if (tenant && Object.keys(tenantUpdates).length > 0) {
        await Tenant.findByIdAndUpdate(tenant._id, { $set: tenantUpdates });
    }

    // Update the franchisee
    const updatedSuperFranchisee = await User.findByIdAndUpdate(
        _id,
        updateData,
        { new: true }
    );

    // Update sub-franchisees status if isActive was changed
    if (isActive !== undefined) {
        await User.updateMany(
            { createdBy: _id },
            { $set: { isActive: isActive } }
        );
    }

    if (!updatedSuperFranchisee) {
        throw new ApiError(500, "Something went wrong; profile not updated");
    }

    // Return response with populated tenantId
    const finalUser = await User.findById(updatedSuperFranchisee._id)
        .populate("tenantId")
        .select("-password -refreshToken");

    return res.status(200).json(
        new ApiResponse(200, finalUser, "Profile updated successfully")
    );
});

//superfranchsiee password update with hashed password
const updatePassword = asyncHandler(async (req, res) => {
    let { _id } = req.query;
    const { password, newPassword } = req.body;
    // Trim any extra spaces from _id
    _id = _id?.trim();
    // Check if the _id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(_id)) {
        throw new ApiError(400, "Invalid ObjectId format");
    }
    // Check required fields
    if (!password) {
        throw new ApiError(400, "Password is required");
    }
    // Find the superfranchisee
    const superFranchisee = await User.findById(_id);
    if (!superFranchisee) {
        throw new ApiError(404, "Superfranchisee not found");
    }
    // Check if the password is correct
    const isValidPassword = await bcrypt.compare(password, superFranchisee.password);
    if (!isValidPassword) {
        throw new ApiError(401, "Incorrect password");
    }
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    // Update the superfranchisee's password
    const updatedSuperFranchisee = await User.findByIdAndUpdate(
        _id,
        {
            password: hashedPassword,
        },
        {
            new: true,
        }
    );
    return res.status(200).json(new ApiResponse(201, { message: "Password updated successfully" }, updatedSuperFranchisee, { success: true }));
});

// Function to send money from SuperFranchisee to Franchisee

function generateTransactionNumber() {
    const prefix = "#CR";
    const timestamp = Date.now().toString(); // Current timestamp as a unique number
    return prefix + timestamp;
}
// Send money from SuperFranchisee to Franchisee

// Send money from Admin to Franchisee
const sendMoneyToFranchisee = asyncHandler(async (req, res) => {
    const { userId, franchiseeId, credits } = req.body;
    const amount = credits;
    const admin = await User.findById(userId);
    const franchisee = await User.findById(franchiseeId);


    if (!admin || !franchisee) {
        return res.status(404).json({ message: 'Admin or Franchisee not found' });
    }

    if (admin.wallet < amount) {
        return res.status(400).json({ message: 'Insufficient admin balance' });
    }

    admin.wallet -= amount;
    franchisee.wallet += amount;

    await admin.save();
    await franchisee.save();

    const transactionNumber = generateTransactionNumber();

    // Create ledger entry for Admin
    await Ledger.create({
        userId: admin._id,
        amount: amount,
        type: 'debit',
        description: `Transferred to Franchisee ID: ${franchisee._id}`,
        balanceAfterTransaction: admin.wallet,
        transactionId: transactionNumber,
        remarks: `Online Payment`,
        username: `${admin.username}/${franchisee.username}`
    });

    // Create ledger entry for Super Franchisee
    await Ledger.create({
        userId: franchisee._id,
        amount: amount,
        type: 'credit',
        description: `Received from Admin ID: ${admin._id}`,
        balanceAfterTransaction: franchisee.wallet,
        transactionId: transactionNumber,
        remarks: `Online Payment`,
        username: `${franchisee.username}/${admin.username}`
    });

    return res.status(200).json({ success: true, wallet: franchisee.wallet });
});

const franchisee = asyncHandler(async (req, res) => {

    const userId = req.query.userId;

    try {
        const franchisees = await User.find({ createdBy: userId })
            .select("-password -refreshToken") // Exclude sensitive info
        if (franchisees.length === 0) {
            return res.status(404).json({ success: false, message: 'No franchisees found' });
        }

        res.status(200).json({ success: true, franchisees });
    } catch (error) {
        console.error('Error fetching franchisees:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

export { updatePassword, franchisee, sendMoneyToFranchisee, superFranchiseeUpdate, sfUpdate }
