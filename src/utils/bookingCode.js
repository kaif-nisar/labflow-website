import { testSchema } from "../models/newTest.model.js";
import { addPannel } from "../models/AddPannel.model.js";
import { Package } from "../models/addPackage.model.js";

const BOOKING_CODE_MODEL_CONFIGS = [
  { model: testSchema },
  { model: addPannel },
  { model: Package },
];

const buildBookingCodeScopeQuery = ({
  tenantId = null,
  createdBy = null,
  createdByRole = null,
} = {}) => {
  if (tenantId) {
    return { tenantId };
  }

  const query = {};

  if (createdBy) {
    query.createdBy = createdBy;
  }

  if (createdByRole) {
    query.createdByRole = createdByRole;
  }

  return query;
};

const getMaxBookingCodeForScope = async (scopeQuery = {}) => {
  const maxDocs = await Promise.all(
    BOOKING_CODE_MODEL_CONFIGS.map(({ model }) =>
      model
        .findOne({
          ...scopeQuery,
          bookingCode: { $ne: null },
        })
        .sort({ bookingCode: -1 })
        .select("bookingCode")
        .lean()
    )
  );

  return maxDocs.reduce((maxValue, doc) => {
    const bookingCode = Number(doc?.bookingCode || 0);
    return bookingCode > maxValue ? bookingCode : maxValue;
  }, 0);
};

const getNextBookingCodeForScope = async (scope) => {
  const scopeQuery = buildBookingCodeScopeQuery(scope);
  const currentMax = await getMaxBookingCodeForScope(scopeQuery);
  return currentMax + 1;
};

const ensureBookingCodesForScope = async (scope) => {
  const scopeQuery = buildBookingCodeScopeQuery(scope);
  let nextBookingCode = await getMaxBookingCodeForScope(scopeQuery);

  for (const { model } of BOOKING_CODE_MODEL_CONFIGS) {
    const missingDocs = await model
      .find({
        ...scopeQuery,
        $or: [
          { bookingCode: { $exists: false } },
          { bookingCode: null },
        ],
      })
      .sort({ createdAt: 1, _id: 1 })
      .select("_id")
      .lean();

    if (missingDocs.length === 0) {
      continue;
    }

    const operations = missingDocs.map((doc) => {
      nextBookingCode += 1;
      return {
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: { bookingCode: nextBookingCode },
          },
        },
      };
    });

    await model.bulkWrite(operations, { ordered: true });
  }

  return nextBookingCode;
};

export {
  buildBookingCodeScopeQuery,
  ensureBookingCodesForScope,
  getNextBookingCodeForScope,
};
