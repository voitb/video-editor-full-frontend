/**
 * Status Messages Component
 * Displays error and success messages for export.
 */

interface StatusMessagesProps {
  showError: boolean;
  errorMessage: string | null;
  showSuccess: boolean;
  fileSizeBytes: number | null;
}

export function StatusMessages({
  showError,
  errorMessage,
  showSuccess,
  fileSizeBytes,
}: StatusMessagesProps) {
  return (
    <>
      {/* Error Message */}
      {showError && errorMessage && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            backgroundColor: 'rgba(220, 53, 69, 0.2)',
            borderRadius: 4,
            color: '#ff6b6b',
            fontSize: 13,
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Success Message */}
      {showSuccess && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            backgroundColor: 'rgba(40, 167, 69, 0.2)',
            borderRadius: 4,
            color: '#51cf66',
            fontSize: 13,
          }}
        >
          Export complete!{' '}
          {fileSizeBytes && `(${(fileSizeBytes / 1024 / 1024).toFixed(1)} MB)`}
        </div>
      )}
    </>
  );
}
