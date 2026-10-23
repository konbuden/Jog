/** Selected file size uses decimal MB; decompressed XML has a separate memory bound. */
export const IMPORT_FILE_MAX_MB = 200;
export const IMPORT_EXPANDED_MAX_GB = 5;
export const IMPORT_LIMITS = {
  fileBytes: IMPORT_FILE_MAX_MB * 1_000_000,
  expandedXmlBytes: IMPORT_EXPANDED_MAX_GB * 1_000_000_000,
  zipEntries: 10_000,
  centralDirectoryBytes: 8 * 1024 * 1024,
};
