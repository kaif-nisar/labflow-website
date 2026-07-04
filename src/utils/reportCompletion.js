const COMPLETION_STATUS = Object.freeze({
    completed: "Completed",
    partial: "Partially Completed",
});

const DOT_ONLY_VALUE_REGEX = /^[.\s]+$/;

const isBlankOrDotOnlyValue = (value) => {
    const normalized = String(value ?? "").trim();
    return normalized === "" || DOT_ONLY_VALUE_REGEX.test(normalized);
};

const normalizeCompletionMeta = (meta = {}) => {
    const totalRows = Number(meta?.totalRows ?? meta?.totalValueRows ?? 0);
    const savedRows = Number(meta?.savedRows ?? meta?.savedValueRows ?? 0);
    const skippedRows = Number(meta?.skippedRows ?? meta?.skippedValueRows ?? 0);
    const hasIncompleteValues = Boolean(
        meta?.hasIncompleteValues ??
        meta?.hasBlankValues ??
        skippedRows > 0
    );

    return {
        totalRows: Number.isFinite(totalRows) ? totalRows : 0,
        savedRows: Number.isFinite(savedRows) ? savedRows : 0,
        skippedRows: Number.isFinite(skippedRows) ? skippedRows : 0,
        hasIncompleteValues,
    };
};

const resolveCompletionStatus = (status, completionMeta = {}) => {
    const normalizedStatus = String(status ?? "").trim().toLowerCase();
    const normalizedMeta = normalizeCompletionMeta(completionMeta);

    if (normalizedStatus.includes("partial")) {
        return COMPLETION_STATUS.partial;
    }

    if (normalizedStatus.includes("complete")) {
        return normalizedMeta.hasIncompleteValues ? COMPLETION_STATUS.partial : COMPLETION_STATUS.completed;
    }

    return normalizedMeta.hasIncompleteValues ? COMPLETION_STATUS.partial : COMPLETION_STATUS.completed;
};

export {
    COMPLETION_STATUS,
    isBlankOrDotOnlyValue,
    normalizeCompletionMeta,
    resolveCompletionStatus,
};
