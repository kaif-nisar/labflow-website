import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/apiError.js";
import { newBooking } from "../models/NewBooking.model.js"
import { ApiResponse } from "../utils/ApiResponse.js";
import { storeLocalFile } from "../utils/localStorage.js";
import { testSchema } from "../models/newTest.model.js";
import { User } from "../models/user.model.js";
import { addPannel } from "../models/AddPannel.model.js";
import { Package } from "../models/addPackage.model.js";
import { Ledger } from "../models/ledger.model.js";
import { acceptedBarcode } from "../models/samples.model.js";
import mongoose from "mongoose";
import { Conversation } from "../models/message.model.js";
import { bookedTestsresult } from "../models/Testvalues.model.js";
import { lisdata } from "../models/lismodel.js";
import { Target } from "../models/target.model.js";
import {
    BOOKING_ITEM_MODEL_BY_TYPE,
    buildValidatedSelectionSnapshot,
    getDoctorDisplayName,
} from "../utils/doctorPricing.js";

const getEffectiveBookingUserId = (req) => (
    req.user.role === "staff" ? req.user.parentUser : req.user._id
);

const canManageBookingsAcrossTenant = (req) => (
    req.user.role === "admin" ||
    (req.user.role === "staff" && req.user.permissions?.canManageBookings)
);

const normalizeOptionalEmail = (value) => String(value || "").trim().toLowerCase();

const buildDoctorSnapshot = (doctor = {}, fallback = {}) => {
    const displayName = String(
        getDoctorDisplayName(doctor)
        || fallback.savedDoctor
        || fallback.doctorName
        || ""
    ).trim();
    const normalizedEmail = normalizeOptionalEmail(doctor?.email || fallback.savedDoctorEmail);

    return {
        displayName,
        email: normalizedEmail,
        firstName: String(doctor?.firstName || "").trim(),
        lastName: String(doctor?.lastName || "").trim(),
        source: doctor?._id ? "doctor-ref" : "snapshot",
    };
};

const buildBookingAccessQuery = (req, bookingIdentifier, options = {}) => {
    const { useDocumentId = false } = options;
    const query = {
        tenantId: req.user.tenantId._id,
        [useDocumentId ? "_id" : "bookingId"]: bookingIdentifier
    };

    if (!canManageBookingsAcrossTenant(req)) {
        query.createdBy = getEffectiveBookingUserId(req);
    }

    return query;
};

const mapAcceptedBarcodeEntries = (tableData = []) => (
    tableData
        .map((entry) => ({
            barcode: entry.confirmBarcodeId || entry.barcodeId || "",
            sampleType: entry.typeOfSample || "",
            testandpannelArray: typeof entry.testName === "string"
                ? entry.testName.split(",").map((name) => name.trim()).filter(Boolean)
                : [],
            testIds: Array.isArray(entry.ids) ? entry.ids : []
        }))
        .filter((entry) => entry.barcode)
);

const mergeAcceptedBarcodeEntries = (existingEntries = [], incomingEntries = []) => {
    const mergedEntries = new Map();

    const mergeEntry = (entry) => {
        const normalizedEntry = {
            barcode: entry?.barcode || "",
            sampleType: entry?.sampleType || "",
            testandpannelArray: Array.isArray(entry?.testandpannelArray) ? entry.testandpannelArray.filter(Boolean) : [],
            testIds: Array.isArray(entry?.testIds) ? entry.testIds : []
        };

        if (!normalizedEntry.barcode) {
            return;
        }

        const key = `${normalizedEntry.barcode}__${normalizedEntry.sampleType}`;
        const existing = mergedEntries.get(key);

        if (!existing) {
            mergedEntries.set(key, {
                ...normalizedEntry,
                testandpannelArray: [...new Set(normalizedEntry.testandpannelArray)],
                testIds: normalizedEntry.testIds.reduce((acc, item) => {
                    const itemKey = `${item?.id}_${item?.collectionName}`;
                    if (item?.id && item?.collectionName && !acc.some((saved) => `${saved.id}_${saved.collectionName}` === itemKey)) {
                        acc.push(item);
                    }
                    return acc;
                }, [])
            });
            return;
        }

        existing.testandpannelArray = [
            ...new Set([
                ...existing.testandpannelArray,
                ...normalizedEntry.testandpannelArray
            ])
        ];

        normalizedEntry.testIds.forEach((item) => {
            const itemKey = `${item?.id}_${item?.collectionName}`;
            if (item?.id && item?.collectionName && !existing.testIds.some((saved) => `${saved.id}_${saved.collectionName}` === itemKey)) {
                existing.testIds.push(item);
            }
        });
    };

    existingEntries.forEach(mergeEntry);
    incomingEntries.forEach(mergeEntry);

    return Array.from(mergedEntries.values());
};

const syncAcceptedBarcodesForBooking = async ({ tenantId, bookingId, tableData, session, mode = "replace" }) => {
    const mappedBarcodes = mapAcceptedBarcodeEntries(tableData);
    const filter = { tenantId, bookingId };
    let finalBarcodes = mappedBarcodes;

    if (mode === "merge") {
        const existingDoc = await acceptedBarcode.findOne(filter);
        finalBarcodes = mergeAcceptedBarcodeEntries(existingDoc?.barcodes || [], mappedBarcodes);
    }

    if (finalBarcodes.length === 0) {
        await acceptedBarcode.findOneAndDelete(filter, session ? { session } : {});
        return;
    }

    await acceptedBarcode.findOneAndUpdate(
        filter,
        {
            $set: {
                tenantId,
                bookingId,
                barcodes: finalBarcodes
            }
        },
        {
            upsert: true,
            returnDocument: "after",
            setDefaultsOnInsert: true,
            ...(session ? { session } : {})
        }
    );
};

const parseBooleanFlag = (value) => (
    value === true
    || value === "true"
    || value === 1
    || value === "1"
);

const normalizeOptionalObjectIdInput = (value, fieldName = "ObjectId") => {
    if (value === null || typeof value === "undefined") {
        return null;
    }

    const normalizedValue = String(value).trim();
    if (!normalizedValue || normalizedValue === "null" || normalizedValue === "undefined") {
        return null;
    }

    if (!mongoose.Types.ObjectId.isValid(normalizedValue)) {
        throw new ApiError(400, `${fieldName} is invalid`);
    }

    return normalizedValue;
};

const dedupeDisplayStrings = (items = []) => {
    const seen = new Set();

    return (Array.isArray(items) ? items : []).reduce((accumulator, item) => {
        const normalizedValue = String(item || "").trim();
        const normalizedKey = normalizedValue.toLowerCase();
        if (!normalizedValue || seen.has(normalizedKey)) {
            return accumulator;
        }

        seen.add(normalizedKey);
        accumulator.push(normalizedValue);
        return accumulator;
    }, []);
};

const dedupeBookingRowIds = (ids = []) => {
    const seen = new Set();

    return (Array.isArray(ids) ? ids : []).reduce((accumulator, item) => {
        const id = item?.id?.toString?.() || String(item?.id || "").trim();
        const collectionName = String(item?.collectionName || "").trim();
        if (!id || !collectionName) {
            return accumulator;
        }

        const itemKey = `${collectionName}:${id}`;
        if (seen.has(itemKey)) {
            return accumulator;
        }

        seen.add(itemKey);
        accumulator.push({
            id,
            collectionName
        });
        return accumulator;
    }, []);
};

const normalizeBookingTableRows = (tableData = []) => (
    (Array.isArray(tableData) ? tableData : []).map((entry) => {
        const normalizedBarcode = String(entry?.confirmBarcodeId || entry?.barcodeId || "").trim();
        const normalizedNames = dedupeDisplayStrings(
            typeof entry?.testName === "string" ? entry.testName.split(",") : []
        );

        return {
            typeOfSample: String(entry?.typeOfSample || "").trim() || "Unknown",
            barcodeId: normalizedBarcode,
            confirmBarcodeId: normalizedBarcode,
            testName: normalizedNames.join(", "),
            ids: dedupeBookingRowIds(entry?.ids)
        };
    })
);

const normalizeBookingSelectionType = (value) => {
    const normalized = String(value || "").trim().toLowerCase();

    if (normalized === "test" || normalized === "testschema") return "test";
    if (normalized === "panel" || normalized === "panels" || normalized === "pannel" || normalized === "addpannel") {
        return "panel";
    }
    if (normalized === "package" || normalized === "packages") return "package";

    return null;
};

const buildBookingSelectionKey = (itemType, itemId) => {
    const normalizedType = normalizeBookingSelectionType(itemType);
    const normalizedId = itemId?.toString?.() || String(itemId || "").trim();

    if (!normalizedType || !normalizedId) {
        return "";
    }

    return `${normalizedType}:${normalizedId}`;
};

const normalizeRequestedSelectionItems = (selectedItems = [], fallbackIds = []) => {
    if (Array.isArray(selectedItems) && selectedItems.length > 0) {
        const map = new Map();

        selectedItems.forEach((item) => {
            const itemType = normalizeBookingSelectionType(item?.itemType || item?.collectionName);
            const itemId = item?.itemId?.toString?.() || item?.id?.toString?.() || String(item?.itemId || item?.id || "").trim();
            const itemKey = buildBookingSelectionKey(itemType, itemId);

            if (!itemKey) {
                return;
            }

            map.set(itemKey, {
                itemType,
                itemId,
                selectedViaGroupId: item?.selectedViaGroupId || null,
                selectedViaGroupName: item?.selectedViaGroupName || ""
            });
        });

        return Array.from(map.values());
    }

    if (!Array.isArray(fallbackIds)) {
        return [];
    }

    return [...new Set(
        fallbackIds
            .map((item) => item?.toString?.() || String(item || "").trim())
            .filter(Boolean)
    )].map((itemId) => ({
        itemType: null,
        itemId,
        selectedViaGroupId: null,
        selectedViaGroupName: ""
    }));
};

const buildStoredSelectionLookup = (booking) => {
    const storedItems = Array.isArray(booking?.selectedItems) ? booking.selectedItems : [];

    return new Map(
        storedItems
            .map((item) => {
                const itemKey = buildBookingSelectionKey(item?.itemType, item?.itemId);
                if (!itemKey) {
                    return null;
                }

                return [itemKey, item];
            })
            .filter(Boolean)
    );
};

const isRecoverableEditSelectionError = (error) => {
    const message = String(error?.message || "").toLowerCase();

    return (
        message.includes("not available for the chosen doctor")
        || message.includes("selected doctor was not found")
    );
};

const buildEditSelectionSnapshot = async ({
    req,
    bookingUserId,
    doctorId,
    selectedItems = [],
    fallbackIds = [],
    existingBooking = null
}) => {
    try {
        return await buildValidatedSelectionSnapshot({
            req,
            bookingUserId,
            doctorId,
            selectedItems,
            fallbackIds
        });
    } catch (error) {
        if (!isRecoverableEditSelectionError(error)) {
            throw error;
        }

        const normalizedRequestedItems = normalizeRequestedSelectionItems(selectedItems, fallbackIds);
        if (normalizedRequestedItems.length === 0) {
            return [];
        }

        const storedSelectionLookup = buildStoredSelectionLookup(existingBooking);
        const resolvedItems = [];
        const unavailableItems = [];
        let resolvedDoctor = null;
        let resolvedDoctorMode = true;

        for (const requestedItem of normalizedRequestedItems) {
            try {
                const snapshot = await buildValidatedSelectionSnapshot({
                    req,
                    bookingUserId,
                    doctorId,
                    selectedItems: [requestedItem],
                    fallbackIds: []
                });

                if (!resolvedDoctor && snapshot?.doctor) {
                    resolvedDoctor = snapshot.doctor;
                    resolvedDoctorMode = snapshot.isSelfDoctor;
                }

                if (Array.isArray(snapshot?.selectedItems) && snapshot.selectedItems[0]) {
                    resolvedItems.push({
                        ...snapshot.selectedItems[0],
                        selectedViaGroupId: requestedItem.selectedViaGroupId || snapshot.selectedItems[0].selectedViaGroupId || null,
                        selectedViaGroupName: requestedItem.selectedViaGroupName || snapshot.selectedItems[0].selectedViaGroupName || ""
                    });
                    continue;
                }
            } catch (itemError) {
                const storedItem = storedSelectionLookup.get(
                    buildBookingSelectionKey(requestedItem.itemType, requestedItem.itemId)
                );

                if (storedItem) {
                    resolvedItems.push({
                        ...(storedItem.toObject?.() || storedItem),
                        selectedViaGroupId: requestedItem.selectedViaGroupId || storedItem.selectedViaGroupId || null,
                        selectedViaGroupName: requestedItem.selectedViaGroupName || storedItem.selectedViaGroupName || ""
                    });
                    continue;
                }

                if (!isRecoverableEditSelectionError(itemError)) {
                    throw itemError;
                }

                unavailableItems.push(
                    buildBookingSelectionKey(requestedItem.itemType, requestedItem.itemId) || requestedItem.itemId
                );
            }
        }

        if (unavailableItems.length > 0) {
            throw new ApiError(
                400,
                `Selected items are not available for update: ${[...new Set(unavailableItems)].join(", ")}`
            );
        }

        if (!resolvedDoctor) {
            resolvedDoctor = {
                _id: doctorId || existingBooking?.savedDoctorId || null,
                displayName: existingBooking?.savedDoctor || "",
                email: existingBooking?.savedDoctorEmail || "",
                firstName: "",
                lastName: ""
            };
            resolvedDoctorMode = false;
        }

        return {
            doctor: resolvedDoctor,
            isSelfDoctor: resolvedDoctorMode,
            selectedItems: resolvedItems,
            total: resolvedItems.reduce((sum, item) => sum + Number(item?.price || 0), 0)
        };
    }
};

const buildAcceptedBarcodeRowsForSync = async ({ tenantId, bookingId, tableData = [] }) => {
    const acceptedBarcodeRows = [];

    for (const element of tableData) {
        const ids = Array.isArray(element?.ids) ? element.ids : [];
        const testResults = await Promise.all(
            ids.map(async obj => {
                if (obj.collectionName === "testSchema") {
                    const doc = await testSchema.findById(obj.id).select('Name');
                    return doc ? { names: [doc.Name], objects: [obj] } : { names: [], objects: [] };
                }
                if (obj.collectionName === "addPannel") {
                    const doc = await addPannel.findById(obj.id).select('name');
                    return doc ? { names: [doc.name], objects: [obj] } : { names: [], objects: [] };
                }
                if (obj.collectionName === "Package") {
                    const doc = await Package.findById(obj.id)
                        .select('testIds pannelIds')
                        .populate('testIds pannelIds');

                    if (!doc) return { names: [], objects: [] };

                    const packageTestNames = [];
                    const packageTestObjects = [];
                    const packagePanelNames = [];
                    const packagePanelObjects = [];

                    doc.testIds.forEach(test => {
                        if (test.sampleType === element.typeOfSample) {
                            packageTestNames.push(test.Name);
                            packageTestObjects.push({ id: test._id, collectionName: "testSchema" });
                        }
                    });

                    doc.pannelIds.forEach(panel => {
                        if (panel.sampleType === element.typeOfSample) {
                            packagePanelNames.push(panel.name);
                            packagePanelObjects.push({ id: panel._id, collectionName: "addPannel" });
                        }
                    });

                    return {
                        names: [...packageTestNames, ...packagePanelNames],
                        objects: [...packageTestObjects, ...packagePanelObjects]
                    };
                }
                return { names: [], objects: [] };
            })
        );

        const testnames = testResults.flatMap((result) => result.names);
        const testObjects = testResults.flatMap((result) => result.objects);
        const normalizedBarcode = element.confirmBarcodeId || element.barcodeId;

        const existingBarcode = await acceptedBarcode.findOne({
            tenantId,
            bookingId: { $ne: bookingId },
            "barcodes.barcode": normalizedBarcode,
        });

        if (existingBarcode) {
            throw new ApiError(400, `Barcode ${normalizedBarcode} is already accepted in another booking`);
        }

        acceptedBarcodeRows.push({
            barcodeId: normalizedBarcode,
            typeOfSample: element.typeOfSample,
            testName: testnames.join(", "),
            ids: testObjects
        });
    }

    return acceptedBarcodeRows;
};

const findbookingId = async (req, res) => {
    const randomId = req.query.randomId;

    const exists = Boolean(await newBooking.findOne({ bookingId: randomId }));

    return res.status(200).json({ exists });
}

const NewBookingcontroller = asyncHandler(async (req, res) => {
    try {
        const {
            barcodeId, date, time, courierName, courierId, patientName,
            year, gender, patientPhone, doctorName, labName, franchisee,
            clinicalHistory, subFranchisee, savedDoctor, userId,
            savedLab, subFranchiseeId, savedDoctorId, savedLabId, total, tableData, testIds,
            selectedItems, createdbyuser, discountamount, discountunit, savedDoctorEmail
        } = req.body;

        console.log(req.body);

        const tenantId = req.user.tenantId;
        let user;
        if (req.user.role === "staff") {
            user = req.user.parentUser;
        } else {
            user = req.user._id;
        }

        // Clean up optional IDs
        const cleanSubFranchiseeId = normalizeOptionalObjectIdInput(subFranchiseeId, "subFranchiseeId") || undefined;
        const cleanSavedDoctorId = normalizeOptionalObjectIdInput(savedDoctorId, "savedDoctorId") || undefined;
        const cleanSavedLabId = normalizeOptionalObjectIdInput(savedLabId, "savedLabId") || undefined;

        const issinglelayeradmin = tenantId.modelType === "1layer" &&
            (req.user.role === "admin" || (req.user.role === "staff" && req.user.parentRole === "admin"));

        const cleanPatientName = typeof patientName === "string" ? patientName.trim() : "";
        const cleanYear = typeof year === "string" ? year.trim() : "";

        if (!cleanPatientName) {
            return res.status(400).json({ message: "Patient Name is required" });
        }

        // Parse tableData
        let tableData2 = tableData;
        try {
            if (typeof tableData === "string") {
                tableData2 = JSON.parse(tableData);
            }
        } catch (error) {
            return res.status(400).json({ message: "Invalid table data format" });
        }

        if (!Array.isArray(tableData2)) {
            console.error("Error: tableData is not an array", tableData);
            return res.status(400).json({ message: "Invalid data format" });
        }

        if (tableData2.length === 0) {
            return res.status(400).json({ message: "At least one test, panel or package is required" });
        }

        // Check for duplicate barcodes
        for (const element of tableData2) {
            console.log("This is an element:", element);

            const isBarcodeIdPresent = await newBooking.findOne({
                'tableData.barcodeId': element.confirmBarcodeId
            });

            if (isBarcodeIdPresent) {
                return res.status(400).json({ message: `${element.confirmBarcodeId} barcode already present` });
            }
        }

        // Check if booking already exists
        const existingBooking = await newBooking.findOne({
            tenantId: tenantId._id,
            bookingId: barcodeId
        });

        if (existingBooking) {
            return res.status(400).json({ message: 'Booking already exists' });
        }

        // Handle uploaded files
        let fileLink = null;
        if (req.files?.file?.length > 0) {
            const uploadableFilepath = req.files.file[0].path;
            fileLink = await storeLocalFile(uploadableFilepath, {
                category: "documents",
                fileName: req.files.file[0].originalname,
            });
        }

        // Parse tableData and selected items
        let parsedTableData, parsedSelectedTestIds, parsedSelectedItems;
        try {
            parsedTableData = typeof tableData === "string" ? JSON.parse(tableData) : tableData;
            parsedSelectedTestIds = typeof testIds === "string" ? JSON.parse(testIds) : testIds;
            parsedSelectedItems = typeof selectedItems === "string" ? JSON.parse(selectedItems) : selectedItems;
        } catch (error) {
            throw new ApiError(400, "Invalid JSON format for booking data");
        }

        if (!Array.isArray(parsedTableData) || parsedTableData.length === 0) {
            throw new ApiError(400, "At least one test, panel or package is required");
        }

        if (!Array.isArray(parsedSelectedTestIds) || parsedSelectedTestIds.length === 0) {
            throw new ApiError(400, "At least one test, panel or package is required");
        }

        const selectionSnapshot = await buildValidatedSelectionSnapshot({
            req,
            bookingUserId: userId || user,
            doctorId: cleanSavedDoctorId,
            selectedItems: parsedSelectedItems,
            fallbackIds: parsedSelectedTestIds
        });

        if (!selectionSnapshot.selectedItems || selectionSnapshot.selectedItems.length === 0) {
            throw new ApiError(400, "At least one test, panel or package is required");
        }

        const parsedTotal = selectionSnapshot.total;
        const resolvedDoctorName = savedDoctor || getDoctorDisplayName(selectionSnapshot.doctor) || "";
        const resolvedDoctorId = selectionSnapshot.doctor?._id || cleanSavedDoctorId;
        const resolvedDoctorText = doctorName || resolvedDoctorName;
        const resolvedDoctorEmail = normalizeOptionalEmail(
            savedDoctorEmail || selectionSnapshot.doctor?.email
        );
        const resolvedDoctorMeta = buildDoctorSnapshot(selectionSnapshot.doctor, {
            savedDoctor: resolvedDoctorName,
            doctorName: resolvedDoctorText,
            savedDoctorEmail: resolvedDoctorEmail,
        });

        // Extract sampleBarcodeId from parsedTableData
        const sampleBarcodeId = parsedTableData.map(entry => entry.confirmBarcodeId).filter(id => id != null);

        if (sampleBarcodeId.length === 0) {
            throw new ApiError(400, "Sample Barcode IDs are missing in tableData");
        }

        const transactionId = `#CR${Date.now()}${Math.floor(Math.random() * 1000)}`;

        // ============================================================
        // Non-admin users: Handle wallet and commission
        // ============================================================
        if (req.user.role !== "admin" && !(req.user.role === "staff" && req.user.parentRole === "admin")) {
            const bookingUser = await User.findById(userId || user);
            if (!bookingUser) {
                throw new ApiError(404, "Booking user not found");
            }

            // Validate wallet balance
            const balanceAfterTransaction = bookingUser.bookingWallet - parsedTotal;
            if (balanceAfterTransaction < 0) {
                const overdraftAllowed = !!bookingUser.overdraftAllowed;
                const overdraftLimit = Number(bookingUser.overdraftLimit || 0);
                const overdraftNeeded = Math.abs(balanceAfterTransaction);

                if (!overdraftAllowed || overdraftNeeded > overdraftLimit) {
                    return res.status(402).json({ message: 'Insufficient Balance, recharge wallet' });
                }
            }

            let totalCommission = 0;
            const testDetailsForCurrentUser = [];
            const parentUserCache = new Map();

            // ============================================================
            // Calculate commissions
            // ============================================================
            for (const selectedItem of selectionSnapshot.selectedItems) {
                const model = BOOKING_ITEM_MODEL_BY_TYPE[selectedItem.itemType];
                const testOrPackage = model
                    ? await model.findById(selectedItem.itemId)
                    : null;

                if (!testOrPackage) {
                    throw new ApiError(404, "Test/Package with ID " + selectedItem.itemId + " not found");
                }

                const assignedPrices = testOrPackage.assignedPrices || [];
                let currentPrice = Number(selectedItem.price || 0);

                testDetailsForCurrentUser.push({
                    testName: selectedItem.itemName,
                    testPrice: currentPrice,
                });

                let parentId = bookingUser.createdBy;
                let childUsername = bookingUser.username;

                // ============================================================
                // Commission distribution loop
                // ============================================================
                while (parentId) {
                    let parentUser = parentUserCache.get(parentId.toString());
                    if (!parentUser) {
                        parentUser = await User.findById(parentId);
                        if (!parentUser) {
                            console.warn(`⚠️ Parent user not found in DB for ID: ${parentId}. Commission chain broken here.`);
                            break;
                        }
                        parentUserCache.set(parentId.toString(), parentUser);
                    }

                    console.log(`\n🔁 Checking commission for: ${parentUser.username} (Role: ${parentUser.role})`);
                    console.log(`   Child price being used (currentPrice): ₹${currentPrice}`);

                    const parentPrice = assignedPrices.find(price =>
                        price.userId.toString() === parentUser._id.toString()
                    )?.price;

                    if (parentPrice === undefined || parentPrice === null) {
                        console.warn(`⚠️ COMMISSION SKIPPED — No assignedPrice for: ${parentUser.username} (ID: ${parentUser._id})`);
                        console.warn(`   Reason: This user's ID is not present in assignedPrices of this test/package.`);
                        console.warn(`   Fix: Admin should assign a price for this user.`);
                        parentId = parentUser.createdBy;
                        continue;
                    }

                    console.log(`   ${parentUser.username}'s assignedPrice: ₹${parentPrice}`);
                    const commissionForParent = currentPrice - parentPrice;
                    console.log(`   Commission = currentPrice(₹${currentPrice}) - parentPrice(₹${parentPrice}) = ₹${commissionForParent}`);

                    if (commissionForParent <= 0) {
                        parentId = parentUser.createdBy;
                        childUsername = parentUser.username;
                        currentPrice = parentPrice;
                        continue;
                    }

                    // ✅ Valid commission — process karo
                    totalCommission += commissionForParent;

                    const parentLedgerEntry = new Ledger({
                        userId: parentUser._id,
                        username: parentUser.username,
                        amount: commissionForParent,
                        type: "credit",
                        transactionId,
                        description: `${barcodeId}`,
                        balanceAfterTransaction: parentUser.bookingWallet + commissionForParent,
                        receivedFrom: childUsername,
                        myAmount: currentPrice,
                        testDetails: [{
                            testName: selectedItem.itemName,
                            testPrice: currentPrice,
                            commissionAmount: commissionForParent,
                        }],
                        patientName: cleanPatientName,
                        barcodeId: sampleBarcodeId,
                        discountamount: issinglelayeradmin ? Number(discountamount) : 0,
                        discountunit: issinglelayeradmin ? Number(discountunit) : 0,
                    });

                    await parentLedgerEntry.save();
                    parentUser.bookingWallet += commissionForParent;
                    await parentUser.save();

                    console.log(`✅ Commission credited to ${parentUser.username}: ₹${commissionForParent} | New wallet: ₹${parentUser.bookingWallet}`);

                    parentId = parentUser.createdBy;
                    childUsername = parentUser.username;
                    currentPrice = parentPrice;
                }

                console.log(`\n📊 Commission distributed for this test — Total so far: ₹${totalCommission}`);
            }

            // Create ledger entry for booking user (debit)
            const bookingLedgerEntry = new Ledger({
                userId: bookingUser._id,
                username: bookingUser.username,
                amount: parsedTotal,
                patientName: cleanPatientName,
                sampleBarcodeId: sampleBarcodeId,
                type: "debit",
                transactionId,
                description: `Booking for ${barcodeId}`,
                balanceAfterTransaction,
                testDetails: testDetailsForCurrentUser,
                discountamount: issinglelayeradmin ? Number(discountamount) : 0,
                discountunit: issinglelayeradmin ? Number(discountunit) : 0,
            });

            await bookingLedgerEntry.save();

            bookingUser.bookingWallet = balanceAfterTransaction;
            await bookingUser.save();
            console.log(`💳 Booking user ${bookingUser.username} wallet debited. New balance: ₹${balanceAfterTransaction}`);
        }

        // ============================================================
        // Create booking object
        // ============================================================
        const object = {
            bookingId: barcodeId,
            date,
            time,
            courierName,
            courierId,
            patientName: cleanPatientName,
            year: cleanYear,
            gender,
            patientPhone,
            doctorName: resolvedDoctorText,
            labName,
            franchisee,
            clinicalHistory,
            file: fileLink?.url || "",
            tableData: parsedTableData.map(entry => ({
                ...entry,
                barcodeId: entry.confirmBarcodeId || entry.barcodeId,
            })),
            selectedItems: selectionSnapshot.selectedItems,
            total: parsedTotal,
            subFranchisee: subFranchisee || "",
            subFranchiseeId: cleanSubFranchiseeId,
            savedDoctor: resolvedDoctorName,
            savedDoctorId: resolvedDoctorId,
            savedDoctorEmail: resolvedDoctorEmail,
            savedDoctorMeta: resolvedDoctorMeta,
            savedLab: savedLab || "",
            savedLabId: cleanSavedLabId,
            discountamount: issinglelayeradmin ? Number(discountamount) : 0,
            discountunit: issinglelayeradmin ? Number(discountunit) : 0,
            createdBy: userId || user,
            tenantId: tenantId._id,
            createdbyuser: createdbyuser
        };

        // ============================================================
        // Admin/staff booking creation
        // ============================================================
        if (req.user.role === "admin" || (req.user.role === 'staff' && req.user.parentRole === "admin")) {
            const bookingUser = await User.findById(user);
            if (!bookingUser) {
                throw new ApiError(404, "Booking user not found");
            }

            const bookingLedgerEntry = new Ledger({
                userId: bookingUser._id,
                username: bookingUser.username,
                amount: parsedTotal,
                patientName: cleanPatientName,
                sampleBarcodeId: sampleBarcodeId,
                type: "debit",
                transactionId,
                description: `Booking for ${barcodeId}`,
                discountamount: issinglelayeradmin ? Number(discountamount) : 0,
                discountunit: issinglelayeradmin ? Number(discountunit) : 0,
            });

            await bookingLedgerEntry.save();

            const processedPackages = new Set();

            for (const element of parsedTableData) {
                const existingBarcode = await acceptedBarcode.findOne({
                    tenantId: tenantId._id,
                    "barcodes.barcode": element.confirmBarcodeId,
                });

                if (existingBarcode) {
                    console.log("booking already present");
                    return res.status(400).json({ message: "This barcode is already accepted." });
                }

                const savedbarcode = await acceptedBarcode.findOne({
                    tenantId: tenantId._id,
                    bookingId: barcodeId
                });

                const testResults = await Promise.all(
                    element.ids.map(async obj => {
                        if (obj.collectionName === "testSchema") {
                            const doc = await testSchema.findById(obj.id).select('Name');
                            return doc ? { names: [doc.Name], objects: [obj] } : { names: [], objects: [] };
                        }

                        if (obj.collectionName === "addPannel") {
                            const doc = await addPannel.findById(obj.id).select('name');
                            return doc ? { names: [doc.name], objects: [obj] } : { names: [], objects: [] };
                        }

                        if (obj.collectionName === "Package") {
                            const packageKey = `${obj.id}_${element.typeOfSample}`;
                            if (processedPackages.has(packageKey)) {
                                return { names: [], objects: [] };
                            }
                            processedPackages.add(packageKey);

                            const doc = await Package.findById(obj.id)
                                .select('testIds pannelIds')
                                .populate('testIds pannelIds');

                            console.log("packages :", doc);
                            if (!doc) return { names: [], objects: [] };

                            const packagetestNames = [];
                            const packagetestObjects = [];
                            const packagepanelNames = [];
                            const packagepanelObjects = [];

                            const addedTestIds = new Set();
                            const addedPanelIds = new Set();

                            doc.testIds.forEach(test => {
                                if (test.sampleType === element.typeOfSample && !addedTestIds.has(test._id.toString())) {
                                    packagetestNames.push(test.Name);
                                    packagetestObjects.push({ id: test._id, collectionName: "testSchema" });
                                    addedTestIds.add(test._id.toString());
                                }
                            });

                            doc.pannelIds.forEach(panel => {
                                if (panel.sample_types[0] === element.typeOfSample && !addedPanelIds.has(panel._id.toString())) {
                                    packagepanelNames.push(panel.name);
                                    packagepanelObjects.push({ id: panel._id, collectionName: "addPannel" });
                                    addedPanelIds.add(panel._id.toString());
                                }
                            });

                            return {
                                names: [...packagetestNames, ...packagepanelNames],
                                objects: [...packagetestObjects, ...packagepanelObjects]
                            };
                        }
                        return { names: [], objects: [] };
                    })
                );

                const allNames = testResults.flatMap(r => r.names);
                const allObjects = testResults.flatMap(r => r.objects);

                const testnames = [...new Set(allNames)];
                const testObjectsMap = new Map();
                allObjects.forEach(obj => {
                    const key = `${obj.id}_${obj.collectionName}`;
                    if (!testObjectsMap.has(key)) {
                        testObjectsMap.set(key, obj);
                    }
                });
                const testObjects = Array.from(testObjectsMap.values());

                if (savedbarcode) {
                    await acceptedBarcode.updateOne(
                        { bookingId: barcodeId },
                        {
                            $addToSet: {
                                barcodes: {
                                    barcode: element.confirmBarcodeId,
                                    testandpannelArray: testnames,
                                    sampleType: element.typeOfSample,
                                    testIds: testObjects
                                }
                            }
                        }
                    );
                } else {
                    const newBarcodeDocument = new acceptedBarcode({
                        tenantId: tenantId._id,
                        bookingId: barcodeId,
                        barcodes: [{
                            barcode: element.confirmBarcodeId,
                            testandpannelArray: testnames,
                            sampleType: element.typeOfSample,
                            testIds: testObjects
                        }],
                    });

                    await newBarcodeDocument.save();
                }
            }

            object.status = "pending";
        }

        // ============================================================
        // Create booking
        // ============================================================
        const createdBooking = await newBooking.create([object]);

        if (!createdBooking || createdBooking.length === 0) {
            throw new ApiError(500, "Failed to create booking");
        }

        const booking = createdBooking[0];

        // Staff activity tracking
        if (req.user.role === 'staff') {
            await User.findByIdAndUpdate(
                req.user._id,
                {
                    $push: {
                        activities: {
                            activityType: "booking",
                            details: {
                                staffId: req.user._id,
                                staffName: req.user.fullName,
                                action: `${req.user.fullName} created a new Booking`,
                                patientName: booking.patientName,
                                patientBookingId: booking._id
                            },
                            reference: {
                                model: "Booking",
                                id: booking._id
                            },
                            timestamp: new Date()
                        }
                    }
                }
            );
        }

        // Update ledger with caseId
        const savedcaseid = await Ledger.updateMany(
            { transactionId },
            { $set: { caseId: booking._id } }
        );

        if (!savedcaseid) {
            throw new ApiError(500, "Failed to update ledger with caseId");
        }

        // Update target achievement
        const currentMonth = new Date().toISOString().slice(0, 7);
        if (req.user.role !== "admin" && !(req.user.role === "staff" && req.user.parentRole === "admin")) {
            const currentTarget = await Target.findOne({
                franchiseeId: user,
                month: currentMonth,
                tenantId: tenantId._id
            });

            if (currentTarget) {
                await currentTarget.updateAchieved(parsedTotal, booking._id);
            } else {
                await Target.create([{
                    franchiseeId: user,
                    fullName: req.user.fullName,
                    assignedBy: req.user._id,
                    month: currentMonth,
                    amount: 0,
                    achieved: parsedTotal,
                    tenantId: tenantId._id,
                    history: [{
                        amount: parsedTotal,
                        bookingId: booking._id,
                        description: 'Booking completed (No target set)'
                    }]
                }]);
            }
        }

        res.status(201).json(new ApiResponse(200, booking, "Test booked successfully and commissions distributed"));

    } catch (err) {
        console.error("Booking failed:", err);
        throw err;
    }
});

const cancelBookingController = asyncHandler(async (req, res) => {
    try {
        const { bookingId } = req.body;
        const tenantId = req.user.tenantId;

        let user;
        if (req.user.role === "staff") {
            user = req.user.parentUser;
        } else {
            user = req.user._id;
        }

        let issinglelayeradmin = false;
        issinglelayeradmin = tenantId.modelType === "1layer" && (req.user.role === "admin" || (req.user.role === "staff" && req.user.parentRole === "admin"));

        // Validate required fields
        if (!bookingId) {
            return res.status(400).json("Booking ID is required");
        }

        // Find the booking to cancel
        const existingBooking = await newBooking.findOne({
            tenantId: tenantId._id,
            bookingId: bookingId
        });

        if (!existingBooking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        if (existingBooking.isreportready) {
            return res.status(400).json({ message: 'Booking not canceled because report has been processed' });
        }

        // Check if booking is already cancelled
        if (existingBooking.status === "cancelled") {
            return res.status(400).json({ message: 'Booking is already cancelled' });
        }

        // Generate cancellation transaction ID
        const cancellationTransactionId = `#CNL${Date.now()}${Math.floor(Math.random() * 1000)}`;

        // Find all ledger entries related to this booking
        const relatedLedgerEntries = await Ledger.find({
            caseId: existingBooking._id
        });

        if (relatedLedgerEntries.length === 0) {
            return res.status(404).json({ message: 'No ledger entries found for this booking' });
        }

        // Extract sampleBarcodeId from existing booking
        const sampleBarcodeId = existingBooking.tableData.map(entry => entry.barcodeId || entry.confirmBarcodeId).filter(id => id != null);

        if (
            req.user.role !== "admin" &&
            !(req.user.role === "staff" && req.user.parentRole === "admin")
        ) {
            // Process reversal for non-admin users

            // Find the booking user's debit entry (original booking entry)
            const bookingDebitEntry = relatedLedgerEntries.find(entry =>
                entry.type === "debit" && entry.userId.toString() === user.toString()
            );

            if (!bookingDebitEntry) {
                throw new ApiError(404, "Original booking entry not found");
            }

            // Fetch booking user
            const bookingUser = await User.findById(user);
            if (!bookingUser) {
                throw new ApiError(404, "Booking user not found");
            }

            // Credit back the amount to booking user
            const refundAmount = bookingDebitEntry.amount;
            const newBalanceForBookingUser = bookingUser.bookingWallet + refundAmount;

            // Create reversal ledger entry for booking user (credit back)
            const bookingCreditEntry = new Ledger({
                userId: bookingUser._id,
                username: bookingUser.username,
                amount: refundAmount,
                patientName: existingBooking.patientName,
                sampleBarcodeId: sampleBarcodeId,
                type: "credit",
                transactionId: cancellationTransactionId,
                description: `Booking cancellation refund for ${bookingId}`,
                balanceAfterTransaction: newBalanceForBookingUser,
                testDetails: bookingDebitEntry.testDetails,
                discountamount: issinglelayeradmin ? bookingDebitEntry.discountamount : 0,
                discountunit: issinglelayeradmin ? bookingDebitEntry.discountunit : 0,
                caseId: existingBooking._id
            });

            await bookingCreditEntry.save();

            // Update booking user wallet
            bookingUser.bookingWallet = newBalanceForBookingUser;
            await bookingUser.save();

            // Process commission reversals for all parent users
            const commissionEntries = relatedLedgerEntries.filter(entry =>
                entry.type === "credit" && entry.userId.toString() !== user.toString()
            );

            for (const commissionEntry of commissionEntries) {
                // Find the parent user
                const parentUser = await User.findById(commissionEntry.userId);
                if (!parentUser) {
                    console.warn(`Parent user ${commissionEntry.userId} not found. Skipping commission reversal.`);
                    continue;
                }

                // Debit the commission amount from parent user
                const commissionAmount = commissionEntry.amount;
                const newBalanceForParent = parentUser.bookingWallet - commissionAmount;

                // Create reversal ledger entry for parent (debit back)
                const parentDebitEntry = new Ledger({
                    userId: parentUser._id,
                    username: parentUser.username,
                    amount: commissionAmount,
                    type: "debit",
                    transactionId: cancellationTransactionId,
                    description: `Commission reversal for cancelled booking ${bookingId}`,
                    balanceAfterTransaction: newBalanceForParent,
                    receivedFrom: commissionEntry.receivedFrom,
                    myAmount: commissionEntry.myAmount,
                    testDetails: commissionEntry.testDetails,
                    patientName: existingBooking.patientName,
                    barcodeId: sampleBarcodeId,
                    discountamount: issinglelayeradmin ? commissionEntry.discountamount : 0,
                    discountunit: issinglelayeradmin ? commissionEntry.discountunit : 0,
                    caseId: existingBooking._id
                });

                await parentDebitEntry.save();

                // Update parent user wallet
                parentUser.bookingWallet = newBalanceForParent;
                await parentUser.save();
            }
        }

        if (req.user.role === "admin" || (req.user.role === 'staff' && req.user.parentRole === "admin")) {
            // For admin users, just create a reversal entry without wallet changes

            // Find the booking user's debit entry (original booking entry)
            const bookingDebitEntry = relatedLedgerEntries.find(entry =>
                entry.type === "debit" && entry.userId.toString() === user.toString()
            );

            if (bookingDebitEntry) {
                // Fetch booking user
                const bookingUser = await User.findById(user);
                if (bookingUser) {
                    // Create reversal ledger entry for admin booking cancellation
                    const adminCancellationEntry = new Ledger({
                        userId: bookingUser._id,
                        username: bookingUser.username,
                        amount: bookingDebitEntry.amount,
                        patientName: existingBooking.patientName,
                        sampleBarcodeId: sampleBarcodeId,
                        type: "credit",
                        transactionId: cancellationTransactionId,
                        description: `Admin booking cancellation for ${bookingId}`,
                        discountamount: issinglelayeradmin ? bookingDebitEntry.discountamount : 0,
                        discountunit: issinglelayeradmin ? bookingDebitEntry.discountunit : 0,
                        caseId: existingBooking._id
                    });

                    await adminCancellationEntry.save();
                }
            }

            // Remove from acceptedBarcode collection
            for (const tableEntry of existingBooking.tableData) {
                const barcodeToRemove = tableEntry.barcodeId || tableEntry.confirmBarcodeId;

                if (barcodeToRemove) {
                    // Remove the specific barcode from the barcodes array
                    await acceptedBarcode.updateOne(
                        {
                            tenantId: tenantId._id,
                            bookingId: bookingId
                        },
                        {
                            $pull: {
                                barcodes: { barcode: barcodeToRemove }
                            }
                        }
                    );

                    // If no barcodes left, remove the entire document
                    const remainingBarcodes = await acceptedBarcode.findOne({
                        tenantId: tenantId._id,
                        bookingId: bookingId
                    });

                    if (remainingBarcodes && remainingBarcodes.barcodes.length === 0) {
                        await acceptedBarcode.deleteOne({
                            tenantId: tenantId._id,
                            bookingId: bookingId
                        });
                    }
                }
            }
        }

        // Update booking status to cancelled
        existingBooking.status = "cancelled";
        existingBooking.cancelledAt = new Date();
        existingBooking.cancelledBy = req.user._id;
        await existingBooking.save();

        // Add activity for staff cancellation
        if (req.user.role === 'staff') {
            await User.findByIdAndUpdate(req.user._id, {
                $push: {
                    activities: {
                        activityType: "booking_cancellation",
                        details: {
                            staffId: req.user._id,
                            staffName: req.user.fullName,
                            action: `${req.user.fullName} cancelled a booking`,
                            patientName: existingBooking.patientName,
                            patientBookingId: existingBooking._id
                        },
                        reference: {
                            model: "Booking",
                            id: existingBooking._id
                        },
                        timestamp: new Date()
                    }
                }
            });
        }

        res.status(200).json(new ApiResponse(200, existingBooking, "Booking cancelled successfully and all transactions reversed"));

    } catch (err) {
        console.error("Cancellation failed:", err);
        throw err;
    }
});

// ========================================
// SEARCH BOOKING API
// ========================================

const SearchBookingController = asyncHandler(async (req, res) => {
    try {
        const { bookingId, patientName } = req.body;
        const tenantId = req.user.tenantId;

        // Validate required fields
        if (!bookingId) {
            return res.status(400).json({
                success: false,
                message: 'Booking ID is required'
            });
        }

        // Build search query
        let searchQuery = {
            tenantId: tenantId._id,
            bookingId: bookingId
        };

        // Add patient name filter if provided
        if (patientName && patientName.trim()) {
            searchQuery.patientName = {
                $regex: patientName.trim(),
                $options: 'i' // Case insensitive
            };
        }

        // Find the booking with populated data
        const booking = await newBooking.findOne(searchQuery)
            .populate('createdBy', 'fullName username')
            .populate('subFranchiseeId', 'name')
            .populate('savedDoctorId', 'displayName firstName lastName')
            .populate('savedLabId', 'name');

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Get test names for table data
        const enhancedTableData = await Promise.all(
            (booking.tableData || []).map(async (entry) => {
                let testNames = [];

                if (entry.ids && entry.ids.length > 0) {
                    for (const idObj of entry.ids) {
                        try {
                            let testDoc = null;

                            if (idObj.collectionName === "testSchema") {
                                testDoc = await testSchema.findById(idObj.id).select('Name');
                                if (testDoc) testNames.push(testDoc.Name);
                            } else if (idObj.collectionName === "addPannel") {
                                testDoc = await addPannel.findById(idObj.id).select('name');
                                if (testDoc) testNames.push(testDoc.name);
                            } else if (idObj.collectionName === "Package") {
                                testDoc = await Package.findById(idObj.id).select('packageName');
                                if (testDoc) testNames.push(testDoc.packageName);
                            }
                        } catch (error) {
                            console.log(`Error fetching test ${idObj.id}:`, error);
                        }
                    }
                }

                return {
                    ...entry,
                    testNames: testNames,
                    barcodeId: entry.barcodeId || entry.confirmBarcodeId
                };
            })
        );

        // Prepare response data
        const populatedSubFranchisee = booking.subFranchiseeId;
        const populatedDoctor = booking.savedDoctorId;
        const populatedLab = booking.savedLabId;

        const bookingData = {
            _id: booking._id,
            bookingId: booking.bookingId,
            patientName: booking.patientName,
            patientPhone: booking.patientPhone,
            date: booking.date,
            time: booking.time,
            year: booking.year,
            gender: booking.gender,
            doctorName: booking.doctorName,
            labName: booking.labName,
            franchisee: booking.franchisee,
            subFranchisee: booking.subFranchisee || populatedSubFranchisee?.name || '',
            subFranchiseeId: populatedSubFranchisee?._id || booking.subFranchiseeId || null,
            courierName: booking.courierName,
            courierId: booking.courierId,
            clinicalHistory: booking.clinicalHistory,
            total: booking.total,
            status: booking.status || 'pending',
            tableData: enhancedTableData,
            selectedItems: booking.selectedItems || [],
            savedDoctor: booking.savedDoctor || getDoctorDisplayName(populatedDoctor) || '',
            savedDoctorId: populatedDoctor?._id || booking.savedDoctorId || null,
            savedDoctorEmail: booking.savedDoctorEmail || '',
            savedLab: booking.savedLab || populatedLab?.name || '',
            savedLabId: populatedLab?._id || booking.savedLabId || null,
            file: booking.file || '',
            createdBy: booking.createdBy,
            createdAt: booking.createdAt,
            updatedAt: booking.updatedAt,
            cancelledAt: booking.cancelledAt,
            cancelledBy: booking.cancelledBy,
            discountamount: booking.discountamount || 0,
            discountunit: booking.discountunit || 0
        };

        res.status(200).json({
            success: true,
            message: 'Booking found successfully',
            data: bookingData
        });

    } catch (error) {
        console.error("Search booking error:", error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

const editbookingbookedtests = async (req, res) => {
    try {
        const {
            barcodeId, date, time, courierName, courierId, patientName,
            year, gender, patientPhone, doctorName, labName, franchisee,
            clinicalHistory, subFranchisee, savedDoctor,
            savedLab, subFranchiseeId, savedDoctorId, savedLabId, total, tableData, testIds,
            selectedItems, createdbyuser, discountamount, discountunit, userId: incomingBookingUserId, savedDoctorEmail,
            replaceExistingSelection
        } = req.body;

        const userId = getEffectiveBookingUserId(req);
        const canManageAcrossTenant = canManageBookingsAcrossTenant(req);
        const tenantId = req.user.tenantId;
        let issinglelayeradmin = false;
        issinglelayeradmin = tenantId.modelType === "1layer" && req.user.role === "admin";
        const shouldReplaceSelection = parseBooleanFlag(replaceExistingSelection);

        const parsedSubFranchiseeId = normalizeOptionalObjectIdInput(subFranchiseeId, "subFranchiseeId");
        const parsedSavedDoctorId = normalizeOptionalObjectIdInput(savedDoctorId, "savedDoctorId");
        const parsedSavedLabId = normalizeOptionalObjectIdInput(savedLabId, "savedLabId");
        let tableData2 = tableData;
        if (typeof tableData === "string") {
            tableData2 = JSON.parse(tableData);
        }

        if (!Array.isArray(tableData2)) {
            console.error("Error: tableData is not an array", tableData);
            return res.status(400).json({ message: "Invalid booking sample data format" });
        }

        // Ensure all barcodeIds are present (non-empty)
        for (const element of tableData2) {
            const barcodeValue = element.confirmBarcodeId || element.barcodeId;
            if (!barcodeValue || barcodeValue.trim() === "") {
                return res.status(400).json({
                    message: `Barcode ID is missing for sample type "${element.typeOfSample || 'Unknown'}"`
                });
            }
        }


        // Validate barcodes uniqueness (excluding current booking)
        for (const element of tableData2) {
            const isBarcodeIdPresent = await newBooking.findOne({
                tenantId: tenantId._id,
                bookingId: { $ne: barcodeId },
                'tableData.barcodeId': element.confirmBarcodeId
            });

            if (isBarcodeIdPresent) {
                return res.status(400).json({ message: `${element.confirmBarcodeId} barcode already present` });
            }
        }

        if (!patientName) {
            return res.status(400).json({ message: "Patient Name is required" });
        }

        // Get existing booking
        const existingBooking = await newBooking.findOne(
            buildBookingAccessQuery(req, barcodeId)
        );

        if (!existingBooking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        if (existingBooking.status === "cancelled") {
            return res.status(404).json({ message: 'Booking has been Cancelled' });
        }

        const effectiveSubFranchiseeId = parsedSubFranchiseeId ?? existingBooking.subFranchiseeId ?? null;
        const effectiveSavedDoctorId = parsedSavedDoctorId ?? existingBooking.savedDoctorId ?? null;
        const effectiveSavedLabId = parsedSavedLabId ?? existingBooking.savedLabId ?? null;

        // Handle file upload
        let fileLink = null;
        if (req.files?.file?.length > 0) {
            const uploadableFilepath = req.files.file[0].path;
            fileLink = await storeLocalFile(uploadableFilepath, {
                category: "documents",
                fileName: req.files.file[0].originalname,
            });
        }

        // Parse data
        let parsedTableData, parsedSelectedTestIds, parsedSelectedItems;
        try {
            parsedTableData = JSON.parse(tableData);
            parsedSelectedTestIds = JSON.parse(testIds);
            parsedSelectedItems = typeof selectedItems === "string" ? JSON.parse(selectedItems) : selectedItems;
        } catch (error) {
            throw new ApiError(400, "Invalid JSON format for booking data");
        }

        parsedTableData = normalizeBookingTableRows(parsedTableData);
        parsedSelectedTestIds = Array.isArray(parsedSelectedTestIds) ? parsedSelectedTestIds : [];
        parsedSelectedItems = Array.isArray(parsedSelectedItems) ? parsedSelectedItems : [];

        const effectiveSelectionUserId = canManageAcrossTenant
            ? (incomingBookingUserId || existingBooking.createdBy || userId)
            : userId;

        const selectionSnapshot = await buildEditSelectionSnapshot({
            req,
            bookingUserId: effectiveSelectionUserId,
            doctorId: effectiveSavedDoctorId,
            selectedItems: parsedSelectedItems,
            fallbackIds: parsedSelectedTestIds,
            existingBooking
        });

        if (
            !selectionSnapshot
            || Array.isArray(selectionSnapshot)
            || !Array.isArray(selectionSnapshot.selectedItems)
            || selectionSnapshot.selectedItems.length === 0
        ) {
            return res.status(400).json({
                message: "At least one test, panel or package must remain selected"
            });
        }

        const parsedTotal = selectionSnapshot.total;
        const resolvedDoctorName = savedDoctor || existingBooking.savedDoctor || getDoctorDisplayName(selectionSnapshot.doctor) || "";
        const resolvedDoctorId = selectionSnapshot.doctor?._id || effectiveSavedDoctorId || null;
        const resolvedDoctorText = doctorName || existingBooking.doctorName || resolvedDoctorName;
        const resolvedDoctorEmail = normalizeOptionalEmail(
            savedDoctorEmail || existingBooking.savedDoctorEmail || selectionSnapshot.doctor?.email
        );
        const resolvedDoctorMeta = buildDoctorSnapshot(selectionSnapshot.doctor, {
            savedDoctor: resolvedDoctorName,
            doctorName: resolvedDoctorText,
            savedDoctorEmail: resolvedDoctorEmail,
        });

        const sampleBarcodeId = parsedTableData.map(entry => entry.confirmBarcodeId).filter(id => id != null);
        let nextTableData = [];
        let nextSelectedItems = [];
        let nextTotal = parsedTotal;
        let acceptedBarcodeSyncMode = "merge";

        if (shouldReplaceSelection) {
            const rowBarcodeTypes = new Map();
            const barcodeConflicts = [];

            parsedTableData.forEach((entry) => {
                const normalizedBarcode = entry.confirmBarcodeId || entry.barcodeId;
                const normalizedSampleType = String(entry.typeOfSample || "").trim() || "Unknown";

                const savedSampleType = rowBarcodeTypes.get(normalizedBarcode);
                if (savedSampleType && savedSampleType !== normalizedSampleType) {
                    barcodeConflicts.push(`${normalizedBarcode} (${savedSampleType} vs ${normalizedSampleType})`);
                } else {
                    rowBarcodeTypes.set(normalizedBarcode, normalizedSampleType);
                }
            });

            if (barcodeConflicts.length > 0) {
                return res.status(400).json({
                    message: 'Same barcode cannot have different sample types',
                    conflicts: [...new Set(barcodeConflicts)]
                });
            }

            nextTableData = parsedTableData.map((entry) => ({
                typeOfSample: entry.typeOfSample,
                barcodeId: entry.confirmBarcodeId || entry.barcodeId,
                testName: entry.testName || '',
                ids: entry.ids || []
            }));
            nextSelectedItems = selectionSnapshot.selectedItems;
            nextTotal = parsedTotal;
            acceptedBarcodeSyncMode = "replace";
        } else {
            // === STRICT CHECK: Duplicate Tests in SAME Barcode + TypeOfSample ===
            const existingTableData = existingBooking.tableData || [];
            const duplicateTests = [];
            const duplicateBarcodes = [];

            // Check 1: Barcode uniqueness across entire database (excluding current booking)
            for (const newEntry of parsedTableData) {
                const barcodeInOtherBooking = await newBooking.findOne({
                    tenantId: tenantId._id,
                    bookingId: { $ne: barcodeId },
                    'tableData.barcodeId': newEntry.confirmBarcodeId || newEntry.barcodeId
                });

                if (barcodeInOtherBooking) {
                    duplicateBarcodes.push(newEntry.confirmBarcodeId || newEntry.barcodeId);
                }
            }

            if (duplicateBarcodes.length > 0) {
                return res.status(400).json({
                    message: 'Barcode already exists in another booking',
                    duplicateBarcodes: [...new Set(duplicateBarcodes)]
                });
            }

            // Check 2: Within current booking - same barcode can't have different typeOfSample
            parsedTableData.forEach(newEntry => {
                const newBarcodeId = newEntry.confirmBarcodeId || newEntry.barcodeId;
                const newTypeOfSample = newEntry.typeOfSample;

                existingTableData.forEach(existing => {
                    if (existing.barcodeId === newBarcodeId && existing.typeOfSample !== newTypeOfSample) {
                        duplicateBarcodes.push(`${newBarcodeId} (Type conflict: ${existing.typeOfSample} vs ${newTypeOfSample})`);
                    }
                });
            });

            if (duplicateBarcodes.length > 0) {
                return res.status(400).json({
                    message: 'Same barcode cannot have different sample types',
                    conflicts: [...new Set(duplicateBarcodes)]
                });
            }

            // Check 3: Duplicate tests in SAME barcode + SAME typeOfSample
            parsedTableData.forEach(newEntry => {
                const newBarcodeId = newEntry.confirmBarcodeId || newEntry.barcodeId;
                const newTypeOfSample = newEntry.typeOfSample;

                const matchingExisting = existingTableData.find(
                    existing =>
                        existing.barcodeId === newBarcodeId &&
                        existing.typeOfSample === newTypeOfSample
                );

                if (matchingExisting) {
                    if (matchingExisting.testName && newEntry.testName) {
                        const existingTestNames = matchingExisting.testName.split(',').map(t => t.trim().toLowerCase());
                        const newTestNames = newEntry.testName.split(',').map(t => t.trim().toLowerCase());

                        newTestNames.forEach(testName => {
                            if (existingTestNames.includes(testName)) {
                                duplicateTests.push(testName);
                            }
                        });
                    }

                    const existingIds = matchingExisting.ids || [];
                    const newIds = newEntry.ids || [];

                    newIds.forEach(newId => {
                        const isDuplicate = existingIds.some(
                            existingId =>
                                existingId.id.toString() === newId.id.toString() &&
                                existingId.collectionName === newId.collectionName
                        );
                        if (isDuplicate) {
                            duplicateTests.push(`${newId.collectionName}-${newId.id}`);
                        }
                    });
                }
            });

            if (duplicateTests.length > 0) {
                return res.status(400).json({
                    message: 'Tests already exist in this booking',
                    duplicateTests: [...new Set(duplicateTests)]
                });
            }

            const mergedTableData = [...existingTableData];

            parsedTableData.forEach(newEntry => {
                const newBarcodeId = newEntry.confirmBarcodeId || newEntry.barcodeId;
                const newTypeOfSample = newEntry.typeOfSample;

                const matchingIndex = mergedTableData.findIndex(
                    existing =>
                        existing.barcodeId === newBarcodeId &&
                        existing.typeOfSample === newTypeOfSample
                );

                if (matchingIndex !== -1) {
                    const existing = mergedTableData[matchingIndex];
                    const existingTestNames = existing.testName ? existing.testName.split(',').map(t => t.trim()) : [];
                    const newTestNames = newEntry.testName ? newEntry.testName.split(',').map(t => t.trim()) : [];
                    const mergedTestNames = [...new Set([...existingTestNames, ...newTestNames])];

                    const existingIds = existing.ids || [];
                    const newIds = newEntry.ids || [];
                    const mergedIds = [...existingIds];

                    newIds.forEach(newId => {
                        const isDuplicate = existingIds.some(
                            existingId =>
                                existingId.id.toString() === newId.id.toString() &&
                                existingId.collectionName === newId.collectionName
                        );
                        if (!isDuplicate) {
                            mergedIds.push(newId);
                        }
                    });

                    mergedTableData[matchingIndex] = {
                        typeOfSample: newTypeOfSample,
                        barcodeId: newBarcodeId,
                        testName: mergedTestNames.join(', '),
                        ids: mergedIds
                    };
                } else {
                    mergedTableData.push({
                        typeOfSample: newTypeOfSample,
                        barcodeId: newBarcodeId,
                        testName: newEntry.testName || '',
                        ids: newEntry.ids || []
                    });
                }
            });

            const existingSelectedItems = Array.isArray(existingBooking.selectedItems)
                ? existingBooking.selectedItems
                : [];
            const mergedSelectedItemsMap = new Map(
                existingSelectedItems.map((item) => [
                    `${item.itemType}:${item.itemId.toString()}`,
                    item
                ])
            );

            selectionSnapshot.selectedItems.forEach((item) => {
                mergedSelectedItemsMap.set(
                    `${item.itemType}:${item.itemId.toString()}`,
                    item
                );
            });

            nextTableData = mergedTableData;
            nextSelectedItems = Array.from(mergedSelectedItemsMap.values());
            nextTotal = existingBooking.total + parsedTotal;
        }

        // === Wallet and Ledger Logic (Non-Admin) ===
        if (!canManageAcrossTenant && !shouldReplaceSelection) {
            const bookingUser = await User.findById(userId);
            if (!bookingUser) {
                throw new ApiError(404, "Booking user not found");
            }

            const balanceAfterTransaction = bookingUser.bookingWallet - parsedTotal;
            const testDetailsForCurrentUser = [];
            const transactionId = `#CR${Date.now()}${Math.floor(Math.random() * 1000)}`;
            const parentUserCache = new Map();

            for (const selectedItem of selectionSnapshot.selectedItems) {
                const model = BOOKING_ITEM_MODEL_BY_TYPE[selectedItem.itemType];
                const testOrPackage = model
                    ? await model.findById(selectedItem.itemId)
                    : null;

                if (!testOrPackage) {
                    throw new ApiError(404, `Test/Package with ID ${selectedItem.itemId} not found`);
                }

                const assignedPrices = testOrPackage.assignedPrices || [];
                let currentPrice = Number(selectedItem.price || 0);

                testDetailsForCurrentUser.push({
                    testName: selectedItem.itemName,
                    testPrice: currentPrice,
                });

                let parentId = bookingUser.createdBy;
                let childUsername = bookingUser.username;

                while (parentId) {
                    let parentUser = parentUserCache.get(parentId.toString());
                    if (!parentUser) {
                        parentUser = await User.findById(parentId);
                        if (!parentUser) break;
                        parentUserCache.set(parentId.toString(), parentUser);
                    }

                    const parentPrice = assignedPrices.find(price => price.userId.toString() === parentUser._id.toString())?.price;

                    if (parentPrice === undefined || parentPrice === null) {
                        parentId = parentUser.createdBy;
                        continue;
                    }

                    const commissionForParent = currentPrice - parentPrice;

                    if (commissionForParent <= 0) {
                        parentId = parentUser.createdBy;
                        childUsername = parentUser.username;
                        currentPrice = parentPrice;
                        continue;
                    }

                    const parentLedgerEntry = new Ledger({
                        userId: parentUser._id,
                        username: parentUser.username,
                        amount: commissionForParent,
                        type: "credit",
                        transactionId,
                        description: `${barcodeId}`,
                        balanceAfterTransaction: parentUser.bookingWallet + commissionForParent,
                        receivedFrom: childUsername,
                        myAmount: currentPrice,
                        testDetails: [{
                            testName: selectedItem.itemName,
                            testPrice: currentPrice,
                            commissionAmount: commissionForParent,
                        }],
                        patientName: patientName,
                        barcodeId: sampleBarcodeId,
                    });

                    await parentLedgerEntry.save();
                    parentUser.bookingWallet += commissionForParent;
                    await parentUser.save();

                    parentId = parentUser.createdBy;
                    childUsername = parentUser.username;
                    currentPrice = parentPrice;
                }
            }

            const bookingLedgerEntry = new Ledger({
                userId: bookingUser._id,
                username: bookingUser.username,
                amount: parsedTotal,
                patientName: patientName,
                sampleBarcodeId: sampleBarcodeId,
                type: "debit",
                transactionId,
                description: `Booking for ${barcodeId}`,
                balanceAfterTransaction,
                testDetails: testDetailsForCurrentUser,
            });

            await bookingLedgerEntry.save();
            bookingUser.bookingWallet = balanceAfterTransaction;
            await bookingUser.save();
        }

        // === Update Booking Document ===
        const updateObject = {
            date,
            time,
            courierName,
            courierId,
            patientName,
            year,
            gender,
            patientPhone,
            doctorName: resolvedDoctorText,
            labName: labName || existingBooking.labName || "",
            franchisee: franchisee || existingBooking.franchisee || "",
            clinicalHistory,
            file: fileLink?.url || existingBooking.file,
            tableData: nextTableData,
            selectedItems: nextSelectedItems,
            total: nextTotal,
            subFranchisee: subFranchisee || existingBooking.subFranchisee || "",
            subFranchiseeId: effectiveSubFranchiseeId,
            savedDoctor: resolvedDoctorName,
            savedDoctorId: resolvedDoctorId,
            savedDoctorEmail: resolvedDoctorEmail,
            savedDoctorMeta: resolvedDoctorMeta,
            savedLab: savedLab || existingBooking.savedLab || "",
            savedLabId: effectiveSavedLabId,
            discountamount: issinglelayeradmin ? Number(discountamount) : existingBooking.discountamount,
            discountunit: issinglelayeradmin ? Number(discountunit) : existingBooking.discountunit,
            createdbyuser: createdbyuser,
            status: "pending",
            isreportready: false,
        };

        const updatedDoc = await newBooking.findOneAndUpdate(
            buildBookingAccessQuery(req, barcodeId),
            { $set: updateObject },
            { returnDocument: "after" }
        );

        if (!updatedDoc) {
            throw new ApiError(404, "Failed to update booking");
        }

        // Keep accepted barcode data in sync for admin-side edits.
        if (canManageAcrossTenant) {
            const acceptedBarcodeRows = await buildAcceptedBarcodeRowsForSync({
                tenantId: tenantId._id,
                bookingId: barcodeId,
                tableData: shouldReplaceSelection ? nextTableData : parsedTableData
            });

            await syncAcceptedBarcodesForBooking({
                tenantId: tenantId._id,
                bookingId: barcodeId,
                tableData: acceptedBarcodeRows,
                mode: acceptedBarcodeSyncMode
            });
        }

        if (req.user.role === 'staff') {
            await User.findByIdAndUpdate(req.user._id, {
                $push: {
                    activities: {
                        activityType: "other",
                        details: {
                            staffId: req.user._id,
                            staffName: req.user.fullName,
                            action: `${req.user.fullName} edited booked tests in a booking`,
                            bookingName: updatedDoc.patientName,
                            bookingId: updatedDoc.bookingId,

                        },
                        reference: {
                            model: "Booking",
                            id: updatedDoc._id
                        },
                        timestamp: new Date()
                    }
                }
            });
        }

        return res.status(200).json(new ApiResponse(
            200,
            updatedDoc,
            shouldReplaceSelection ? "Booking updated successfully" : "Test edited successfully and commissions distributed"
        ));

    } catch (err) {
        console.error("Error in editbookingbookedtests:", err);
        return res.status(err.statusCode || 500).json({
            message: err.message || "Failed to edit booking"
        });
    }
}

const editBookingBarcodes = async (req, res) => {
    try {
        const { tableData, id } = req.body;
        const tenantId = req.user.tenantId._id;

        // Validate
        if (!id || !Array.isArray(tableData)) {
            return res.status(400).json({ message: "Invalid input" });
        }

        for (const element of tableData) {
            const barcodepresent = await newBooking.findOne({
                tenantId,
                "tableData.barcodeId": element.barcodeId,
                _id: { $ne: id }
            });

            if (barcodepresent) {
                return res.status(402).json({ message: `${element.barcodeId} already present` });
            }
        }
        const booking = await newBooking.findOne(
            buildBookingAccessQuery(req, id, { useDocumentId: true })
        );

        if (!booking) {
            return res.status(404).json({ message: "Booking not found" });
        }

        if (booking.status === "cancelled") {
            return res.status(400).json({ message: "Cancelled booking cannot be updated" });
        }

        booking.tableData = tableData;
        booking.status = "pending";
        booking.isreportready = false;
        await booking.save();

        const existingAcceptedBarcode = await acceptedBarcode.findOne({
            tenantId,
            bookingId: booking.bookingId
        }).lean();

        if (existingAcceptedBarcode) {
            await syncAcceptedBarcodesForBooking({
                tenantId,
                bookingId: booking.bookingId,
                tableData
            });
        }

        // अगर staff का parentUser है तो उसे भी notify करें
        if (req.user.role === 'staff') {
            await User.findByIdAndUpdate(req.user._id, {
                $push: {
                    activities: {
                        activityType: "other",
                        details: {
                            staffId: req.user._id,
                            staffName: req.user.fullName,
                            action: `${req.user.fullName} updated barcodes in a booking`,
                            bookingName: booking.patientName,
                            bookingId: booking.bookingId,

                        },
                        reference: {
                            model: "Booking",
                            id: booking._id
                        },
                        timestamp: new Date()
                    }
                }
            });
        }

        return res.status(200).json({ message: "Barcodes updated successfully", booking });

    } catch (error) {
        console.error("Error updating barcodes:", error);
        return res.status(500).json({ message: "Something went wrong" });
    }
};


const allBookingsController = asyncHandler(async (req, res) => {

    const tenantId = req.user.tenantId._id;
    let userId;
    if (req.user.role === 'staff') {
        userId = req.user.parentUser
    } else {
        userId = req.user._id
    }


    const lastBookingDetails = await newBooking.findOne({
        tenantId: tenantId,
        createdBy: userId
    }).sort({ createdAt: -1 })

    if (!lastBookingDetails) {
        return res.status(200).json({ message: "not found", status: "empty" });
    }

    return res.status(200).json(lastBookingDetails);
})

const getAllBookingsController = asyncHandler(async (req, res) => {
    const { page = 1, limit = 50 } = req.query;
    const {
        regNo,
        patientName,
        gender,
        patientPhone,
        labName,
        status,
        franchisee,
        doctorName,
        barcode,
        startDate,
        endDate
    } = req.body;

    const skip = (page - 1) * limit;

    let query = {
        tenantId: req.user.tenantId._id,
        status: { $nin: ["cancelled", "canceled"] }
    };
    const andConditions = [];

    const parseLocalDateBoundary = (value, endOfDay = false) => {
        if (!value) return null;

        const [year, month, day] = String(value).split("-").map(Number);
        if (!year || !month || !day) {
            return null;
        }

        return new Date(
            year,
            month - 1,
            day,
            endOfDay ? 23 : 0,
            endOfDay ? 59 : 0,
            endOfDay ? 59 : 0,
            endOfDay ? 999 : 0
        );
    };

    const parsedStartDate = parseLocalDateBoundary(startDate, false);
    const parsedEndDate = parseLocalDateBoundary(endDate, true);

    if (parsedStartDate && Number.isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({ message: "Invalid start date" });
    }

    if (parsedEndDate && Number.isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({ message: "Invalid end date" });
    }

    if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
        return res.status(400).json({ message: "Start date cannot be greater than End date" });
    }

    // Apply basic filters
    if (regNo) andConditions.push({ bookingId: { $regex: regNo, $options: 'i' } });
    if (patientName) query.patientName = { $regex: patientName, $options: 'i' };
    if (gender) query.gender = { $regex: gender, $options: 'i' };
    if (patientPhone) query.patientPhone = { $regex: patientPhone, $options: 'i' };
    if (labName) query.labName = { $regex: labName, $options: 'i' };
    if (status) query.status = { $regex: status, $options: 'i' };
    if (franchisee) query.createdbyuser = { $regex: franchisee, $options: 'i' };
    if (doctorName) query.doctorName = { $regex: doctorName, $options: 'i' };

    if (parsedStartDate || parsedEndDate) {
        query.createdAt = {};

        if (parsedStartDate) {
            query.createdAt.$gte = parsedStartDate;
        }

        if (parsedEndDate) {
            query.createdAt.$lte = parsedEndDate;
        }
    }

    // Handle barcode filter
    if (barcode) {
        const barcodeDocs = await acceptedBarcode.find(
            { "barcodes.barcode": { $regex: barcode, $options: 'i' } },
            { bookingId: 1 }
        ).lean();

        if (barcodeDocs.length > 0) {
            const bookingIds = barcodeDocs.map(doc => doc.bookingId);
            andConditions.push({ bookingId: { $in: bookingIds } });
        } else {
            return res.status(200).json({
                bookings: [],
                total: 0,
                page: parseInt(page),
                limit: parseInt(limit),
            });
        }
    }

    if (andConditions.length > 0) {
        query.$and = andConditions;
    }

    // Fetch bookings with pagination
    const bookings = await newBooking
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

    const total = await newBooking.countDocuments(query);

    // Process barcodes and LIS data for current page bookings
    if (bookings.length > 0) {
        const bookingIds = bookings.map(b => b.bookingId);

        // Fetch barcodes for current page
        const barcodeData = await acceptedBarcode.find(
            { bookingId: { $in: bookingIds } },
            { bookingId: 1, barcodes: 1 }
        ).lean();

        // Create barcode map
        const barcodeMap = new Map();
        const allBarcodeIds = []; // Collect all barcode IDs for LIS check

        barcodeData.forEach(doc => {
            const barcodes = doc.barcodes.map(b => b.barcode);
            barcodeMap.set(doc.bookingId, barcodes);
            allBarcodeIds.push(...barcodes);
        });

        // Check LIS data availability for all barcodes in one query
        let lisAvailabilityMap = new Map();

        if (allBarcodeIds.length > 0) {
            const lisDataDocs = await lisdata.find(
                { "lisData.sample_id": { $in: allBarcodeIds } },
                { "lisData.sample_id": 1 }
            ).lean();

            // Create a set of barcodes that have LIS data for O(1) lookup
            const barcodesWithLis = new Set(
                lisDataDocs.map(doc => doc.lisData?.sample_id).filter(Boolean)
            );

            // Map each barcode to its LIS availability
            allBarcodeIds.forEach(barcodeId => {
                lisAvailabilityMap.set(barcodeId, barcodesWithLis.has(barcodeId));
            });
        }

        // Attach barcodes and LIS status to each booking
        bookings.forEach(booking => {
            const bookingBarcodes = barcodeMap.get(booking.bookingId) || [];

            // Create detailed barcode status array
            const barcodeDetails = bookingBarcodes.map(barcode => ({
                barcode: barcode,
                isLisPresent: lisAvailabilityMap.get(barcode) || false
            }));

            // Backward compatibility - keep old format
            booking.acceptedbarcode = bookingBarcodes;

            // New detailed format
            booking.barcodeDetails = barcodeDetails;

            // Overall LIS status - true if ANY barcode has LIS data
            booking.isLisPresent = barcodeDetails.length > 0
                ? barcodeDetails.some(detail => detail.isLisPresent === true)
                : false;

            // Additional stats
            booking.lisStats = {
                total: barcodeDetails.length,
                withLis: barcodeDetails.filter(d => d.isLisPresent).length,
                withoutLis: barcodeDetails.filter(d => !d.isLisPresent).length
            };
        });
    }

    return res.status(200).json({
        bookings,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
    });
});

const getDashboardDataController = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId._id;
    const userRole = req.user.role;
    const permissions = req.user.permissions || {};

    // Parallel queries with conditional execution based on permissions
    const queries = [];
    
    // Query 1: Always fetch bookings (most users need this)
    queries.push(
        newBooking.find({ tenantId })
            .select('total status date tableData')
            .sort({ createdAt: -1 })
            .lean()
    );

    // Query 2: Fetch franchisees only if user has permission
    if (permissions.canManageUsers || userRole !== 'staff') {
        queries.push(
            User.find({
                tenantId,
                role: { $ne: 'staff' },
                isActive: true
            })
            .select('fullName address phoneNo email isActive')
            .lean()
        );
    } else {
        queries.push(Promise.resolve([]));
    }

    // Execute all queries in parallel
    const [bookings, franchisees] = await Promise.all(queries);

    // Initialize response structure
    const response = {
        stats: {
            totalBookings: 0,
            totalRevenue: 0,
            pendingTests: 0,
            activeFranchises: 0
        },
        charts: {
            monthlyRevenue: { labels: [], data: [] },
            dailyRevenue: { labels: [], data: [] },
            topTests: { labels: [], data: [] }
        },
        franchisees: []
    };

    // If no bookings, return empty response
    if (bookings.length === 0) {
        response.franchisees = franchisees;
        response.stats.activeFranchises = franchisees.length;
        return res.status(200).json(response);
    }

    // Single-pass calculation using Maps for O(1) lookups
    let totalRevenue = 0;
    let pendingTests = 0;
    const dailyRevenue = new Map();
    const monthlyRevenue = new Map();
    const testCategories = new Map();

    // Process all bookings in one loop
    for (const booking of bookings) {
        // Revenue calculation
        const revenue = booking.total || 0;
        totalRevenue += revenue;

        // Pending tests count
        if (booking.status === "pending") {
            pendingTests++;
        }

        // Date-based calculations
        if (booking.date) {
            const date = new Date(booking.date);
            
            if (!isNaN(date.getTime())) {
                // Daily revenue (YYYY-MM-DD format for proper sorting)
                const dayKey = date.toISOString().split('T')[0];
                dailyRevenue.set(dayKey, (dailyRevenue.get(dayKey) || 0) + revenue);

                // Monthly revenue (YYYY-MM format)
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                monthlyRevenue.set(monthKey, (monthlyRevenue.get(monthKey) || 0) + revenue);
            }
        }

        // Test categories
        if (booking.tableData?.[0]?.testName) {
            const testName = booking.tableData[0].testName;
            testCategories.set(testName, (testCategories.get(testName) || 0) + 1);
        }
    }

    // Format stats
    response.stats = {
        totalBookings: bookings.length,
        totalRevenue: Math.round(totalRevenue),
        pendingTests,
        activeFranchises: franchisees.length
    };

    // Format monthly revenue chart data
    const monthlyEntries = Array.from(monthlyRevenue.entries())
        .sort(([a], [b]) => a.localeCompare(b));
    
    response.charts.monthlyRevenue = {
        labels: monthlyEntries.map(([month]) => month),
        data: monthlyEntries.map(([, value]) => Math.round(value))
    };

    // Format daily revenue chart data (last 30 days, reversed for chronological order)
    const dailyEntries = Array.from(dailyRevenue.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 30)
        .reverse();
    
    response.charts.dailyRevenue = {
        labels: dailyEntries.map(([day]) => day),
        data: dailyEntries.map(([, value]) => Math.round(value))
    };

    // Format top 4 test categories
    const topTestEntries = Array.from(testCategories.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 4);
    
    response.charts.topTests = {
        labels: topTestEntries.map(([name]) => name),
        data: topTestEntries.map(([, count]) => count)
    };

    // Add franchisees data
    response.franchisees = franchisees;

    return res.status(200).json(response);
});

const updatebookingstatus = asyncHandler(async (req, res) => {

    const { barcode, status, bookingId } = req.body;

    // Check if barcode already exists
    const existingBarcode = await acceptedBarcode.findOne({
        tenantId: req.user.tenantId._id,
        "barcodes.barcode": barcode.barcode, // Check if barcode exists in any document
    });

    if (existingBarcode) {
        console.log("booking already present");
        return res.status(400).json({ message: "This barcode is already accepted." });
    }


    const savedbarcode = await acceptedBarcode.findOne({
        tenantId: req.user.tenantId._id,
        bookingId: bookingId
    });

    if (savedbarcode) {
        // Update the document if it exists
        await acceptedBarcode.updateOne(
            {
                tenantId: req.user.tenantId._id,
                bookingId: bookingId
            },
            { $addToSet: { barcodes: barcode } } // Use $addToSet to avoid duplicates in the array
        );
    } else {
        // Create a new document if it doesn't exist
        const newBarcodeDocument = new acceptedBarcode({
            tenantId: req.user.tenantId._id,
            bookingId: bookingId,
            barcodes: [barcode], // Add barcode as an array
        });

        await newBarcodeDocument.save();
    }

    let updatedStatus;

    if (status == "pending") {
        updatedStatus = await newBooking.findOneAndUpdate(
            {
                tenantId: req.user.tenantId._id,
                bookingId: bookingId
            },
            { status },
            { new: true }
        )
    }

    if (!updatedStatus) {
        return res.status(400).json({ message: "booking no accepted, please try again" });
        // throw new Error("status not updated");
    }

    // अगर staff का parentUser है तो उसे भी notify करें
    if (req.user.role === 'staff') {
        await User.findByIdAndUpdate(req.user._id, {
            $push: {
                activities: {
                    activityType: "other",
                    details: {
                        staffId: req.user._id,
                        staffName: req.user.fullName,
                        action: `${req.user.fullName} accepted barcode samples`,
                        bookingName: updatedStatus.patientName,
                        sample: barcode,
                        bookingId: updatedStatus.bookingId,
                    },
                    reference: {
                        model: "Booking",
                        id: updatedStatus._id
                    },
                    timestamp: new Date()
                }
            }
        });
    }

    return res.status(200).json({ message: "this barcode sample accepted and booking status updated" });
})

const rejectBookingcontroller = async (req, res) => {
    const { bookingId } = req.body;

    let userRole;
    if (req.user.role === "staff") {
        userRole = req.user.parentRole
    } else {
        userRole = req.user.role
    }
    // 1️⃣ Booking cancel करना
    const updatedStatus = await newBooking.findOneAndUpdate(
        {
            tenantId: req.user.tenantId._id,
            bookingId: bookingId
        },
        {
            status: "canceled",
            isreportready: false
        },
        { new: true }
    );

    if (userRole !== "admin") {
        if (!updatedStatus) {
            throw new Error("Booking status not updated");
        }

        // 2️⃣ User ढूंढना
        const user = await User.findById(updatedStatus.createdBy);

        if (!user) {
            throw new Error("User not found");
        }

        // 3️⃣ Wallet amount जोड़ना
        const updatedUser = await User.findByIdAndUpdate(
            user._id,
            {
                bookingWallet: user.bookingWallet + Number(updatedStatus.total)
            },
            { new: true }
        );

        if (!updatedUser) {
            throw new Error("Refund not initiated");
        }
    }

    // अगर staff का parentUser है तो उसे भी notify करें
    if (req.user.role === 'staff') {
        await User.findByIdAndUpdate(req.user._id, {
            $push: {
                activities: {
                    activityType: "booking_cancellation",
                    details: {
                        staffId: req.user._id,
                        staffName: req.user.fullName,
                        action: `${req.user.fullName} reject booking status`,
                        bookingName: updatedStatus.patientName,
                        bookingId: updatedStatus.bookingId,

                    },
                    reference: {
                        model: "Booking",
                        id: updatedStatus._id
                    },
                    timestamp: new Date()
                }
            }
        });
    }

    // 4️⃣ Success response
    return res.status(200).json({ message: "Booking cancelled successfully, Refund initiated" });
};

const CompleteBookingcontroller = async (req, res) => {
    const { bookingid } = req.body;

    const updatedStatus = await newBooking.findOneAndUpdate(
        { bookingId: bookingid },
        {
            status: "completed",
            isreportready: true
        },
        { new: true }
    )
    // console.log("updated: ", updatedStatus);

    if (!updatedStatus) {
        throw new Error("status not updated");
    }

    // अगर staff का parentUser है तो उसे भी notify करें
    if (req.user.role === 'staff') {
        await User.findByIdAndUpdate(req.user._id, {
            $push: {
                activities: {
                    activityType: "other",
                    details: {
                        staffId: req.user._id,
                        staffName: req.user.fullName,
                        action: `${req.user.fullName} completed bookings status`,
                        bookingName: updatedStatus.patientName,
                        bookingId: updatedStatus.bookingId,
                    },
                    reference: {
                        model: "Booking",
                        id: updatedStatus._id
                    },
                    timestamp: new Date()
                }
            }
        });
    }

    return res.status(200).json({ message: "booking status updated successfully" });
}

const statusBookingcontroller = async (req, res) => {
    const { bookingid, status } = req.body;
    const updatedStatus = await newBooking.findOneAndUpdate(
        { bookingId: bookingid },
        {
            status: status,
        },
        { new: true }
    )
    // console.log("updated: ", updatedStatus);

    if (!updatedStatus) {
        throw new Error("status not updated");
    }

    // अगर staff का parentUser है तो उसे भी notify करें
    if (req.user.role === 'staff') {
        await User.findByIdAndUpdate(req.user._id, {
            $push: {
                activities: {
                    activityType: "booking_updated",
                    details: {
                        staffId: req.user._id,
                        staffName: req.user.fullName,
                        action: `${req.user.fullName} updated booking ${status}`,
                        bookingName: updatedStatus.patientName,
                        bookingId: updatedStatus.bookingId,

                    },
                    reference: {
                        model: "Booking",
                        id: updatedStatus._id
                    },
                    timestamp: new Date()
                }
            }
        });
    }
    return res.status(200).json({ message: "booking status updated successfully" });
}

const deleteBarcode = asyncHandler(async (req, res) => {
    const { barcodeId } = req.body;

    if (!barcodeId) {
        return res.status(400).json({ error: "barcodeId and bookingId are required" });
    }

    // Find the document by bookingId
    const savedBarcode = await acceptedBarcode.findOne({ "barcodes.barcode": barcodeId });

    if (!savedBarcode) {
        return res.status(404).json({ message: "this barcode is not recieved" });
    }

    // Filter out the barcode to delete
    const updatedBarcodes = savedBarcode.barcodes.filter(barcode => barcode.barcode !== barcodeId);

    // Check if the barcode was found
    if (updatedBarcodes.length === savedBarcode.barcodes.length) {
        return res.status(404).json({ error: "Barcode not found" });
    }

    // Update the document with the filtered barcodes
    savedBarcode.barcodes = updatedBarcodes;
    await savedBarcode.save();

    // अगर staff का parentUser है तो उसे भी notify करें
    if (req.user.role === 'staff') {
        await User.findByIdAndUpdate(req.user._id, {
            $push: {
                activities: {
                    activityType: "other",
                    details: {
                        staffId: req.user._id,
                        staffName: req.user.fullName,
                        action: `${req.user.fullName} Deleted Barcode`,
                        barcodeId: barcodeId,

                    },
                    reference: {
                        model: "Booking",
                        id: savedBarcode._id
                    },
                    timestamp: new Date()
                }
            }
        });
    }

    return res.status(200).json({ message: "this Barcode sample deleted successfully", updatedDocument: savedBarcode });
});

const getbarcodebooking = asyncHandler(async (req, res) => {
    const { barcodeId } = req.body;
    const tid = req.user.tenantId._id;

    const data = await getbarcodetestsandpanels(tid, barcodeId);

    return res.status(200).json(data);
})
async function getbarcodetestsandpanels(tid, barcodeId) {
    console.log("tid:", tid);
    console.log("barcodeId:", barcodeId);

    const barcodeBooking = await newBooking.findOne(
        {
            tenantId: tid,
            "tableData.barcodeId": barcodeId
        }
    )

    if (!barcodeBooking) {
        throw new Error("booking not found");
    }

    if (barcodeBooking.status == "canceled") {
        throw new Error("this booking is already cancelled");
    }

    // Check tableData
    if (!barcodeBooking.tableData || barcodeBooking.tableData.length === 0) {
        throw new Error("No table data found for this booking");
    }

    const barcodeobject = barcodeBooking.tableData.find(item => item.barcodeId === barcodeId);

    if (!barcodeobject) {
        throw new Error("Barcode not found in this booking");
    }

    // ✅ Track processed packages to avoid duplicates
    const processedPackages = new Set();

    const testResults = await Promise.all(
        barcodeobject.ids.map(async obj => {
            if (obj.collectionName === "testSchema") {
                const doc = await testSchema.findById(obj.id).select('Name');
                return doc ? { names: [doc.Name], objects: [obj] } : { names: [], objects: [] };
            }

            if (obj.collectionName === "addPannel") {
                const doc = await addPannel.findById(obj.id).select('name');
                return doc ? { names: [doc.name], objects: [obj] } : { names: [], objects: [] };
            }

            if (obj.collectionName === "Package") {
                // ✅ Check if package already processed
                const packageKey = obj.id.toString();
                if (processedPackages.has(packageKey)) {
                    return { names: [], objects: [] }; // Skip duplicate
                }
                processedPackages.add(packageKey);

                const doc = await Package.findById(obj.id)
                    .select('testIds pannelIds')
                    .populate('testIds pannelIds');

                if (!doc) return { names: [], objects: [] };

                const packagetestNames = [];
                const packagetestObjects = [];
                const packagepanelNames = [];
                const packagepanelObjects = [];

                // ✅ Use Set to track already added tests/panels within this package
                const addedTestIds = new Set();
                const addedPanelIds = new Set();

                doc.testIds.forEach(test => {
                    if (test.sampleType === barcodeobject.typeOfSample && !addedTestIds.has(test._id.toString())) {
                        packagetestNames.push(test.Name);
                        packagetestObjects.push({ id: test._id, collectionName: "testSchema" });
                        addedTestIds.add(test._id.toString());
                    }
                });

                doc.pannelIds.forEach(panel => {
                    if (panel.sample_types[0] === barcodeobject.typeOfSample && !addedPanelIds.has(panel._id.toString())) {
                        packagepanelNames.push(panel.name);
                        packagepanelObjects.push({ id: panel._id, collectionName: "addPannel" });
                        addedPanelIds.add(panel._id.toString());
                    }
                });

                return {
                    names: [...packagetestNames, ...packagepanelNames],
                    objects: [...packagetestObjects, ...packagepanelObjects]
                };
            }
            return { names: [], objects: [] };
        })
    );

    // ✅ Flatten and remove any remaining duplicates
    const allNames = testResults.flatMap(r => r.names);
    const allObjects = testResults.flatMap(r => r.objects);

    // Remove duplicate names
    const testnames = [...new Set(allNames)];

    // Remove duplicate objects based on id + collectionName
    const testObjectsMap = new Map();
    allObjects.forEach(obj => {
        const key = `${obj.id}_${obj.collectionName}`;
        if (!testObjectsMap.has(key)) {
            testObjectsMap.set(key, obj);
        }
    });
    const testObjects = Array.from(testObjectsMap.values());

    return {
        booking: barcodeBooking,
        bookedtest: barcodeobject.testName,
        message: "barcode bookings retrieved successfully",
        sampletype: barcodeobject.typeOfSample,
        testandpannels: testnames,
        testIds: testObjects,
        barcodeobject
    };
}

const getbarcodetestsandpannels = asyncHandler(async (req, res) => {

    const { barcodeId, tests, sampletype, bookingId } = req.body;

    const barcode = await getBarcodeTestsAndPanelsCore({
        barcodeId,
        tests,
        sampletype
    });

    return res.status(200).json(barcode);
})

async function getBarcodeTestsAndPanelsCore({ barcodeId, tests, sampletype }) {
    const barcode = {};
    const testandpannelArray = [];

    console.log("this is barcodeId", barcodeId, "that is testnames", tests, "sampletype", sampletype);

    if (tests) {
        // let testArray = tests;
        if (tests.includes(",")) {
            let testArray = tests.split(',');
            for (let element of testArray) {
                const testAndPannels = await Package.findOne(
                    { packageName: element },
                    { pannelname: 1, testname: 1, _id: 0 }
                )
                console.log("testAndPannels", testAndPannels);
                if (testAndPannels) {
                    const testsaddedPannels = [...(testAndPannels?.pannelname), ...(testAndPannels?.testname)];
                    for (const tap of testsaddedPannels) {
                        // Check if it's a single test
                        const singleTest = await testSchema.findOne({ Name: tap, sampleType: sampletype });
                        if (singleTest) {
                            testandpannelArray.push(singleTest.Name);
                            continue; // Move to the next item in the loop
                        }

                        // Check if it's a panel
                        const panel = await addPannel.findOne({ name: tap, sample_types: sampletype });
                        if (panel) {
                            testandpannelArray.push(panel.name);
                            continue;
                        }
                    }
                } else {
                    // Check if it's a single test
                    const singleTest = await testSchema.findOne({ Name: element });
                    if (singleTest) {
                        testandpannelArray.push(singleTest.Name);
                    }

                    // Check if it's a panel
                    const panel = await addPannel.findOne({ name: element });
                    if (panel) {
                        testandpannelArray.push(panel.name);
                    }
                }
            };
        } else {
            const testAndPannels = await Package.findOne(
                { packageName: tests },
                { pannelname: 1, testname: 1, _id: 0 }
            )
            console.log("testAndPannels", testAndPannels);

            if (testAndPannels) {
                const testsaddedPannels = [...(testAndPannels?.pannelname), ...(testAndPannels?.testname)];
                for (const tap of testsaddedPannels) {
                    // Check if it's a single test
                    const singleTest = await testSchema.findOne({ Name: tap, sampleType: sampletype });
                    if (singleTest) {
                        testandpannelArray.push(singleTest.Name);
                        continue; // Move to the next item in the loop
                    }

                    // Check if it's a panel
                    const panel = await addPannel.findOne({ name: tap, sample_types: sampletype });
                    if (panel) {
                        testandpannelArray.push(panel.name);
                        continue;
                    }
                }
            } else {
                // Check if it's a single test
                const singleTest = await testSchema.findOne({ Name: tests });
                if (singleTest) {
                    testandpannelArray.push(singleTest.Name);
                }

                // Check if it's a panel
                const panel = await addPannel.findOne({ name: tests });
                if (panel) {
                    testandpannelArray.push(panel.name);
                }
            }
        }
    }

    barcode.barcode = barcodeId;
    barcode.sampleType = sampletype;
    barcode.testandpannelArray = testandpannelArray;

    return barcode;
}

const bookingreportgenOrnot = asyncHandler(async (req, res) => {
    const { bookingid } = req.body

    const updatedisreportready = await newBooking.findOneAndUpdate(
        { bookingId: bookingid }, { isreportready: true }, { new: true }
    )

    if (!updatedisreportready) {
        throw new Error("isreportready not updated");
    }
    // अगर staff का parentUser है तो उसे भी notify करें
    if (req.user.role === 'staff') {
        await User.findByIdAndUpdate(req.user._id, {
            $push: {
                activities: {
                    activityType: "booking_updated",
                    details: {
                        staffId: req.user._id,
                        staffName: req.user.fullName,
                        action: `${req.user.fullName} Marked report as ready`,
                        bookingName: updatedisreportready.patientName,
                        bookingId: updatedisreportready.bookingId,

                    },
                    reference: {
                        model: "Booking",
                        id: updatedisreportready._id
                    },
                    timestamp: new Date()
                }
            }
        });
    }

    return res.status(200).json(new ApiResponse(200, updatedisreportready, "updated isreportready successfully"));
})

const getthirtydayspreviousBookingsController = asyncHandler(async (req, res) => {
    // Calculate the date 30 days ago from today
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Retrieve bookings from the last 30 days, sorted by 'createdAt' in descending order
    const bookings = await newBooking.find({
        createdAt: { $gte: thirtyDaysAgo }
    }).sort({ createdAt: -1 });

    if (!bookings || bookings.length === 0) {
        throw new ApiError(404, "No bookings found in the last 30 days");
    }

    return res.status(200).json(new ApiResponse(200, bookings, "Bookings from the last 30 days retrieved successfully"));
});

const getTestNameController = async (req, res) => {
    const { bookingId } = req.body;
    const tid = req.user.tenantId._id;

    // ✅ Declare tracking Sets
    const processedPackages = new Set();
    const processedTests = new Set();
    const processedPanels = new Set();

    try {
        console.log("Received bookingId:", bookingId);

        const barcodes = await acceptedBarcode.findOne({
            tenantId: tid,
            bookingId: bookingId
        });

        if (!barcodes) {
            console.log("no barcodes found");
            return res.status(404).json({ message: "No test and panels found for this booking ID." });
        }

        const barcodeResults = await Promise.all(
            barcodes.barcodes.map(async (element) => {
                const array = await Promise.all(
                    element.testIds.map(async (obj) => {
                        // ✅ Handle Test
                        if (obj.collectionName === "testSchema") {
                            const testKey = obj.id.toString();
                            if (processedTests.has(testKey)) {
                                return { singleTests: [], panels: [] };
                            }
                            processedTests.add(testKey);

                            // ✅ Find test by _id OR originalTestId + tenantId compulsory
                            const docs = await testSchema.find({
                                $or: [
                                    { _id: obj.id },
                                    { originalTestId: obj.id }
                                ],
                                tenantId: tid
                            });

                            return { singleTests: docs, panels: [] };
                        }

                        // ✅ Handle Panel
                        if (obj.collectionName === "addPannel") {
                            const panelKey = obj.id.toString();
                            if (processedPanels.has(panelKey)) {
                                return { singleTests: [], panels: [] };
                            }
                            processedPanels.add(panelKey);

                            // ✅ Find panel by _id OR originalPanelId + tenantId compulsory
                            const docs = await addPannel.find({
                                $or: [
                                    { _id: obj.id },
                                    { originalPanelId: obj.id }
                                ],
                                tenantId: tid
                            }).populate({
                                path: 'testsId',
                                match: {
                                    $or: [
                                        { _id: { $exists: true } },
                                        { originalTestId: { $exists: true } }
                                    ],
                                    tenantId: tid
                                }
                            });

                            return { singleTests: [], panels: docs };
                        }

                        // ✅ Handle Package
                        if (obj.collectionName === "Package") {
                            const packageKey = `${obj.id}_${element.typeOfSample}`;
                            if (processedPackages.has(packageKey)) {
                                return { singleTests: [], panels: [] };
                            }
                            processedPackages.add(packageKey);

                            // ✅ Find package by _id OR originalPackageId + tenantId
                            const doc = await Package.findOne({
                                $or: [
                                    { _id: obj.id },
                                    { originalPackageId: obj.id }
                                ],
                                tenantId: tid
                            })
                                .select('testIds pannelIds')
                                .populate({
                                    path: 'testIds',
                                    match: {
                                        $or: [
                                            { _id: { $exists: true } },
                                            { originalTestId: { $exists: true } }
                                        ],
                                        tenantId: tid
                                    }
                                })
                                .populate({
                                    path: 'pannelIds',
                                    match: {
                                        $or: [
                                            { _id: { $exists: true } },
                                            { originalPanelId: { $exists: true } }
                                        ],
                                        tenantId: tid
                                    }
                                });

                            if (!doc) return { singleTests: [], panels: [] };

                            const packageTestIds = [];
                            const packagePanelIds = [];

                            // ✅ Filter tests based on sample type
                            doc.testIds?.forEach(test => {
                                if (test && test.sampleType === element.typeOfSample) {
                                    const testKey = test._id.toString();
                                    if (!processedTests.has(testKey)) {
                                        processedTests.add(testKey);
                                        packageTestIds.push(test._id);
                                    }
                                }
                            });

                            // ✅ Filter panels based on sample type
                            doc.pannelIds?.forEach(panel => {
                                if (panel && panel.sample_types?.[0] === element.typeOfSample) {
                                    const panelKey = panel._id.toString();
                                    if (!processedPanels.has(panelKey)) {
                                        processedPanels.add(panelKey);
                                        packagePanelIds.push(panel._id);
                                    }
                                }
                            });

                            // ✅ Fetch full test documents with condition
                            const packageTests = await testSchema.find({
                                $or: [
                                    { _id: { $in: packageTestIds } },
                                    { originalTestId: { $in: packageTestIds } }
                                ],
                                tenantId: tid
                            });

                            // ✅ Fetch full panel documents with populated tests
                            const packagePanels = await addPannel.find({
                                $or: [
                                    { _id: { $in: packagePanelIds } },
                                    { originalPanelId: { $in: packagePanelIds } }
                                ],
                                tenantId: tid
                            }).populate({
                                path: 'testsId',
                                match: {
                                    $or: [
                                        { _id: { $exists: true } },
                                        { originalTestId: { $exists: true } }
                                    ],
                                    tenantId: tid
                                }
                            });

                            return { singleTests: packageTests, panels: packagePanels };
                        }

                        return { singleTests: [], panels: [] };
                    })
                );

                // ✅ Flatten results
                const singleTests = array.flatMap(r => r.singleTests);
                const panels = array.flatMap(r => r.panels);

                return { barcodes, singleTests, panels };
            })
        );

        // ✅ Merge all barcode results
        const mergedResult = barcodeResults.reduce(
            (acc, curr, index) => {
                if (index === 0) {
                    acc.barcodes = curr.barcodes;
                }
                acc.singleTests = [...acc.singleTests, ...curr.singleTests];
                acc.panels = [...acc.panels, ...curr.panels];
                return acc;
            },
            { barcodes: {}, singleTests: [], panels: [] }
        );

        return res.status(200).json([mergedResult]);
    } catch (error) {
        console.error("Error fetching barcodes:", error.message);
        return res.status(500).json({ message: "Internal server error." });
    }
};

const getallbarcodesController = async (req, res) => {

    try {

        // Find barcodes by bookingId
        const barcodes = await acceptedBarcode.find({});

        // Handle case when no data is found
        if (!barcodes) {
            console.log("no barcodes found")
            return res.status(404).json({ message: "No test and panels found for this booking ID." });
        }

        // Return data if found
        return res.status(200).json(barcodes);
    } catch (error) {
        // Handle server errors
        console.error("Error fetching barcodes:", error.message);
        return res.status(500).json({ message: "Internal server error." });
    }
};
// GET: Fetch bookings
const loadBooking = asyncHandler(async (req, res) => {
    try {
        const { status, startDate, endDate, franchiseeId } = req.query;
        const userId = req.user._id;
        console.log('Query params:', { userId, status, startDate, endDate, franchiseeId });

        const query = {};

        // ✅ Handle franchiseeId first (priority over userId)
        if (franchiseeId) {
            query.createdBy = franchiseeId;
        } else if (userId) {
            query.createdBy = userId;
        }

        // ✅ Add status filter
        if (status) {
            query.status = status;
        }

        // ✅ Add tenant filter
        query.tenantId = req.user.tenantId._id;

        // ✅ Handle date range filter
        if (startDate || endDate) {
            query.createdAt = {};

            if (startDate) {
                const parsedStartDate = new Date(startDate);
                if (isNaN(parsedStartDate)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid start date format'
                    });
                }
                // Set to start of day (00:00:00)
                parsedStartDate.setHours(0, 0, 0, 0);
                query.createdAt.$gte = parsedStartDate;
            }

            if (endDate) {
                const parsedEndDate = new Date(endDate);
                if (isNaN(parsedEndDate)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid end date format'
                    });
                }
                // Set to end of day (23:59:59.999)
                parsedEndDate.setHours(23, 59, 59, 999);
                query.createdAt.$lte = parsedEndDate;
            }
        } else {
            // ✅ Default to last 24 hours if no dates provided
            const now = new Date();
            const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            query.createdAt = {
                $gte: yesterday,
                $lte: now
            };
        }

        console.log('Final query:', JSON.stringify(query, null, 2));

        // Fetch bookings from database
        const bookings = await newBooking.find(query)
            .populate('createdBy', 'fullName')
            .sort({ createdAt: -1 }) // ✅ Most recent first
            .exec();

        // ✅ Return consistent response format
        res.status(200).json({
            success: true,
            count: bookings.length,
            data: bookings
        });

    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch bookings',
            message: error.message
        });
    }
});

const loadAllBooking = asyncHandler(async (req, res) => {
    try {
        const { userId, franchiseeId, startDate, endDate } = req.query;
        const query = {};

        // ✅ Handle userId and franchiseeId properly
        if (franchiseeId) {
            query.createdBy = franchiseeId;
        } else if (userId) {
            query.createdBy = userId;
        }

        query.tenantId = req.user.tenantId._id;

        // ✅ Add date filter
        if (startDate || endDate) {
            query.createdAt = {};

            if (startDate) {
                // Start of the day (00:00:00)
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                query.createdAt.$gte = start;
            }

            if (endDate) {
                // End of the day (23:59:59)
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }

        // Fetch bookings from database
        const bookings = await newBooking.find(query)
            .populate('createdBy', 'fullName')
            .sort({ createdAt: -1 }) // ✅ Most recent first
            .exec();

        // ✅ Return consistent response format
        res.status(200).json({
            success: true,
            count: bookings.length,
            data: bookings
        });

    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch bookings',
            message: error.message
        });
    }
});

const getBookingcontroller = async (req, res) => {
    try {
        const { value1 } = req.body;

        if (!value1) {
            return res.status(400).json({ message: "Booking ID is required" });
        }

        const booking = await newBooking.findOne({
            ...buildBookingAccessQuery(req, value1),
            status: { $ne: "cancelled" }
        });

        if (!booking) {
            return res.status(404).json({ message: "Booking not found or cancelled" });
        }

        return res.status(200).json(booking);
    } catch (error) {
        console.error("Error fetching booking:", error);
        return res.status(500).json({ message: "Something went wrong while fetching booking" });
    }
}

const editBookingController = async (req, res) => {
    try {
        const {
            bookingId, date, time, courierName, courierId, patientName,
            year, gender, patientPhone, doctorName, labName, franchisee,
            clinicalHistory, subFranchisee, savedDoctor, savedLab, savedDoctorEmail
        } = req.body;

        let { subFranchiseeId, savedDoctorId, savedLabId } = req.body;

        subFranchiseeId = normalizeOptionalObjectIdInput(subFranchiseeId, "subFranchiseeId");
        savedDoctorId = normalizeOptionalObjectIdInput(savedDoctorId, "savedDoctorId");
        savedLabId = normalizeOptionalObjectIdInput(savedLabId, "savedLabId");

        // 🔍 Pehle purani booking lao
        if (!bookingId) {
            return res.status(400).json({ message: "Booking ID is required" });
        }

        const booking = await newBooking.findOne(buildBookingAccessQuery(req, bookingId));
        if (!booking) {
            return res.status(404).json({ message: "Booking not found" });
        }

        if (booking.status === "cancelled") {
            return res.status(400).json({ message: "Cancelled booking cannot be updated" });
        }

        let filelink;
        if (req.files && req.files.file && req.files.file.length > 0) {
            const uploadableFilepath = req.files.file[0].path;
            filelink = await storeLocalFile(uploadableFilepath, {
                category: "documents",
                fileName: req.files.file[0].originalname,
            });
        }

        // 🆕 New values object
        const updates = {
            courierName,
            courierId,
            patientName,
            date,
            time,
            year,
            gender,
            patientPhone,
            doctorName,
            labName,
            franchisee,
            clinicalHistory,
            file: filelink?.url ?? booking.file,
            subFranchisee: subFranchisee || "",
            subFranchiseeId,
            savedDoctor: savedDoctor || "",
            savedDoctorId,
            savedDoctorEmail: normalizeOptionalEmail(savedDoctorEmail),
            savedDoctorMeta: buildDoctorSnapshot(
                {
                    _id: savedDoctorId || undefined,
                    displayName: savedDoctor || doctorName || "",
                    email: savedDoctorEmail || "",
                },
                {
                    savedDoctor,
                    doctorName,
                    savedDoctorEmail,
                }
            ),
            savedLab: savedLab || "",
            savedLabId
        };

        // 🧠 CHANGE TRACKING LOGIC with proper comparison
        let historyLogs = [];

        Object.keys(updates).forEach((field) => {
            let oldValue = booking[field];
            let newValue = updates[field];

            // ✅ Skip null/undefined checks - normalize
            if (oldValue === null || oldValue === undefined) oldValue = "";
            if (newValue === null || newValue === undefined) newValue = "";

            // ✅ Special handling for Date field
            if (field === 'date') {
                // Convert both to YYYY-MM-DD format for comparison
                const oldDate = oldValue ? new Date(oldValue).toISOString().split('T')[0] : "";
                const newDate = newValue ? new Date(newValue).toISOString().split('T')[0] : "";
                
                if (oldDate === newDate) {
                    return; // Skip if dates are same
                }
                
                // Store actual Date objects for history
                oldValue = oldValue ? new Date(oldValue) : "";
                newValue = newValue ? new Date(newValue) : "";
            }
            
            // ✅ Special handling for ObjectId fields
            else if (field === 'subFranchiseeId' || field === 'savedDoctorId' || field === 'savedLabId') {
                // Convert to string for comparison
                const oldId = oldValue ? oldValue.toString() : "";
                const newId = newValue ? newValue.toString() : "";
                
                if (oldId === newId) {
                    return; // Skip if IDs are same
                }
            }
            
            // ✅ String fields - trim and normalize
            else if (typeof oldValue === 'string' && typeof newValue === 'string') {
                oldValue = oldValue.trim();
                newValue = newValue.trim();
                
                if (oldValue === newValue) {
                    return; // Skip if strings are same
                }
            }
            
            // ✅ General comparison for other fields
            else {
                if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
                    return; // Skip if values are same
                }
            }

            // 📝 Log the change
            historyLogs.push({
                fieldName: field,
                oldValue: booking[field], // Store original value from DB
                newValue: updates[field],  // Store new value from request
                editedById: req.user._id,
                editedByName: req.user.fullName,
                editedAt: new Date()
            });

            booking[field] = updates[field]; // apply change
        });

        // 📝 History push only if changes exist
        if (historyLogs.length > 0) {
            booking.editHistory.push(...historyLogs);
        }

        await booking.save();

        // 🔔 Activity log (staff case)
        if (req.user.role === 'staff' && historyLogs.length > 0) {
            await User.findByIdAndUpdate(req.user._id, {
                $push: {
                    activities: {
                        activityType: "booking_updated",
                        details: {
                            staffId: req.user._id,
                            staffName: req.user.fullName,
                            action: `${req.user.fullName} edited booking fields.`,
                            bookingName: booking.patientName,
                            bookingId: booking.bookingId,
                        },
                        reference: {
                            model: "Booking",
                            id: booking._id
                        },
                        timestamp: new Date()
                    }
                }
            });
        }

        return res.status(200).json({
            message: historyLogs.length > 0 ? "Booking updated successfully" : "No changes detected",
            data: booking,
            changesTracked: historyLogs.length
        });

    } catch (error) {
        console.error("Edit booking error:", error);
        return res.status(500).json({ message: "Server error while updating booking" });
    }
};

const searchit = asyncHandler(async (req, res) => {
    let userId;
    if (req.user.role === 'staff') {
        userId = req.user.parentUser
    } else {
        userId = req.user._id
    }
    const search = req.query.search || ''; // Extract 'search' from the query
    try {
        // Use a regex for flexible search
        const bookings = await newBooking.find({
            $and: [
                { createdBy: userId },
                { tenantId: req.user.tenantId._id },
                {
                    $or: [
                        { bookingId: { $regex: search, $options: 'i' } },
                        { patientName: { $regex: search, $options: 'i' } },
                        { "tableData.barcodeId": { $regex: search, $options: 'i' } }
                    ]
                }
            ]
        });

        res.status(200).json({ bookings });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch bookings.' });
    }
});

const updategeneratedbillvariable = async (req, res) => {
    const { bookingid } = req.params;

    // console.log(bookingid);
    const updateddoc = await newBooking.findOneAndUpdate(
        { bookingId: bookingid },
        { billGenerated: true },
        { new: true }
    );

    if (!updateddoc) {
        console.log(updateddoc);
        return res.status(501).json("something went wrong! try again");
    }

    // अगर staff का parentUser है तो उसे भी notify करें
    if (req.user.role === 'staff') {
        await User.findByIdAndUpdate(req.user._id, {
            $push: {
                activities: {
                    activityType: "other",
                    details: {
                        staffId: req.user._id,
                        staffName: req.user.fullName,
                        action: `${req.user.fullName} updated billGenerated to true for a booking`,
                        bookingName: updateddoc.patientName,
                        bookingId: updateddoc.bookingId,

                    },
                    reference: {
                        model: "Booking",
                        id: updateddoc._id
                    },
                    timestamp: new Date()
                }
            }
        });
    }

    return res.status(200).json(updateddoc);
}

const HoldBookings = asyncHandler(async (req, res) => {
    let userId;
    if (req.user.role === 'staff') {
        userId = req.user.parentUser
    } else {
        userId = req.user._id
    }
    const tenantId = req.user.tenantId;


    console.log("tenantId:", tenantId._id);
    console.log("createdBy:", userId);

    const HoldBookings = await newBooking.find({

        createdBy: userId,
        status: { $in: ["Hold", "clinical"] }
    }).lean();

    if (!HoldBookings || HoldBookings.length === 0) {
        console.log("Hold bookings not found");
        return res.status(200).json(new ApiResponse(200, "empty"));
    }

    // Add messages to each booking
    for (let booking of HoldBookings) {

        const conversation = await Conversation.findOne({
            bookingId: booking.bookingId,
            tenantId: tenantId._id
        });

        if (conversation) {
            console.log("conversation found");

            booking.messages = conversation.messages;
        }
    }

    return res.status(200).json(new ApiResponse(200, HoldBookings, "Hold bookings fetched successfully"));
});

const canceledBookings = asyncHandler(async (req, res) => {
    let userId;
    if (req.user.role === 'staff') {
        userId = req.user.parentUser
    } else {
        userId = req.user._id
    }

    const tenantId = req.user.tenantId;

    console.log("tenantId:", tenantId._id);
    console.log("createdBy:", userId);

    const HoldBookings = await newBooking.find({

        createdBy: userId,
        status: "cancelled"
    }).sort({ createdAt: -1 }).lean();

    if (!HoldBookings || HoldBookings.length === 0) {
        console.log("Hold bookings not found");
        return res.status(200).json(new ApiResponse(200, "empty"));
    }

    // Add messages to each booking
    for (let booking of HoldBookings) {

        const conversation = await Conversation.findOne({
            bookingId: booking.bookingId,
            tenantId: tenantId._id
        });

        if (conversation) {
            console.log("conversation found");

            booking.messages = conversation.messages;
        }
    }

    return res.status(200).json(new ApiResponse(200, HoldBookings, "Hold bookings fetched successfully"));
});

const countBookingsForAllTenants = asyncHandler(async (req, res) => {
    try {
        // Aggregate booking counts and join tenant details
        const bookingCounts = await testSchema.aggregate([
            { $group: { _id: "$tenantId", count: { $sum: 1 } } },
            {
                $lookup: {
                    from: "tenants", // MongoDB collection name (plural, lowercase)
                    localField: "_id",
                    foreignField: "_id",
                    as: "tenantDetails"
                }
            },
            { $unwind: "$tenantDetails" }
        ]);
        res.status(200).json(bookingCounts);
    } catch (error) {
        console.error("Error counting bookings for tenants:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});


// URL parameter से bookingId लेने के लिए
const DeleteBookingByParamsController = asyncHandler(async (req, res) => {
    try {
        const { bookingId } = req.params;
        const tenantId = req.user.tenantId;
        // Validate bookingId
        if (!bookingId) {
            return res.status(400).json({ message: "Booking ID is required" });
        }

        // Find and delete the booking
        const deletedBooking = await newBooking.findOneAndDelete({
            tenantId: tenantId._id,
            bookingId: bookingId
        });

        if (!deletedBooking) {
            return res.status(404).json({ message: "Booking not found" });
        }

        // अगर staff का parentUser है तो उसे भी notify करें
        if (req.user.role === 'staff') {
            await User.findByIdAndUpdate(req.user._id, {
                $push: {
                    activities: {
                        activityType: "booking_deleted",
                        details: {
                            staffId: req.user._id,
                            staffName: req.user.fullName,
                            action: `${req.user.fullName} updated deleted a booking`,
                            bookingName: deletedBooking.patientName,
                            bookingId: bookingId,

                        },
                        reference: {
                            model: "Booking",
                            id: deletedBooking._id
                        },
                        timestamp: new Date()
                    }
                }
            });
        }
        res.status(200).json({
            success: true,
            message: "Booking deleted successfully",
            deletedBooking: deletedBooking
        });

    } catch (err) {
        console.error("Booking deletion failed:", err);
        return res.status(500).json({
            message: "Failed to delete booking",
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

const getAllCancelledBookingsController = asyncHandler(async (req, res) => {
    const { page = 1, limit = 50 } = req.query;
    const {
        regNo,
        patientName,
        gender,
        patientPhone,
        labName,
        status,
        franchisee,
        doctorName,
        barcode
    } = req.body;

    const skip = (page - 1) * limit;

    let query = {
        tenantId: req.user.tenantId._id,
        status: { $in: ["cancelled", "canceled"] }
    };

    // Apply basic filters
    if (regNo) query.bookingId = { $regex: regNo, $options: 'i' };
    if (patientName) query.patientName = { $regex: patientName, $options: 'i' };
    if (gender) query.gender = { $regex: gender, $options: 'i' };
    if (patientPhone) query.patientPhone = { $regex: patientPhone, $options: 'i' };
    if (labName) query.labName = { $regex: labName, $options: 'i' };
    if (status) query.status = { $regex: status, $options: 'i' };
    if (franchisee) query.createdbyuser = { $regex: franchisee, $options: 'i' };
    if (doctorName) query.doctorName = { $regex: doctorName, $options: 'i' };

    // Handle barcode filter
    if (barcode) {
        const barcodeDocs = await acceptedBarcode.find(
            { "barcodes.barcode": { $regex: barcode, $options: 'i' } },
            { bookingId: 1 }
        ).lean();

        if (barcodeDocs.length > 0) {
            const bookingIds = barcodeDocs.map(doc => doc.bookingId);
            query.bookingId = { $in: bookingIds };
        } else {
            return res.status(200).json({
                bookings: [],
                total: 0,
                page: parseInt(page),
                limit: parseInt(limit),
            });
        }
    }

    // Fetch bookings with pagination
    const bookings = await newBooking
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

    const total = await newBooking.countDocuments(query);

    // Process barcodes and LIS data for current page bookings
    if (bookings.length > 0) {
        const bookingIds = bookings.map(b => b.bookingId);

        // Fetch barcodes for current page
        const barcodeData = await acceptedBarcode.find(
            { bookingId: { $in: bookingIds } },
            { bookingId: 1, barcodes: 1 }
        ).lean();

        // Create barcode map
        const barcodeMap = new Map();
        const allBarcodeIds = []; // Collect all barcode IDs for LIS check

        barcodeData.forEach(doc => {
            const barcodes = doc.barcodes.map(b => b.barcode);
            barcodeMap.set(doc.bookingId, barcodes);
            allBarcodeIds.push(...barcodes);
        });

        // Check LIS data availability for all barcodes in one query
        let lisAvailabilityMap = new Map();

        if (allBarcodeIds.length > 0) {
            const lisDataDocs = await lisdata.find(
                { "lisData.sample_id": { $in: allBarcodeIds } },
                { "lisData.sample_id": 1 }
            ).lean();

            // Create a set of barcodes that have LIS data for O(1) lookup
            const barcodesWithLis = new Set(
                lisDataDocs.map(doc => doc.lisData?.sample_id).filter(Boolean)
            );

            // Map each barcode to its LIS availability
            allBarcodeIds.forEach(barcodeId => {
                lisAvailabilityMap.set(barcodeId, barcodesWithLis.has(barcodeId));
            });
        }

        // Attach barcodes and LIS status to each booking
        bookings.forEach(booking => {
            const bookingBarcodes = barcodeMap.get(booking.bookingId) || [];

            // Create detailed barcode status array
            const barcodeDetails = bookingBarcodes.map(barcode => ({
                barcode: barcode,
                isLisPresent: lisAvailabilityMap.get(barcode) || false
            }));

            // Backward compatibility - keep old format
            booking.acceptedbarcode = bookingBarcodes;

            // New detailed format
            booking.barcodeDetails = barcodeDetails;

            // Overall LIS status - true if ANY barcode has LIS data
            booking.isLisPresent = barcodeDetails.length > 0
                ? barcodeDetails.some(detail => detail.isLisPresent === true)
                : false;

            // Additional stats
            booking.lisStats = {
                total: barcodeDetails.length,
                withLis: barcodeDetails.filter(d => d.isLisPresent).length,
                withoutLis: barcodeDetails.filter(d => !d.isLisPresent).length
            };
        });
    }

    return res.status(200).json({
        bookings,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
    });
});

export {
    canceledBookings,
    loadAllBooking,
    loadBooking,
    NewBookingcontroller,
    allBookingsController,
    getAllBookingsController,
    updatebookingstatus,
    getbarcodebooking,
    bookingreportgenOrnot,
    getthirtydayspreviousBookingsController,
    getbarcodetestsandpannels,
    rejectBookingcontroller,
    deleteBarcode,
    getTestNameController,
    getBookingcontroller,
    editBookingController,
    CompleteBookingcontroller,
    statusBookingcontroller,
    searchit,
    findbookingId,
    getallbarcodesController,
    updategeneratedbillvariable,
    HoldBookings,
    editbookingbookedtests,
    editBookingBarcodes,
    getDashboardDataController,
    countBookingsForAllTenants,
    DeleteBookingByParamsController,
    SearchBookingController,
    cancelBookingController,
    getAllCancelledBookingsController
}
