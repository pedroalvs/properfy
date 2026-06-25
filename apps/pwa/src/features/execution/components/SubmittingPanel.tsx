export function SubmittingPanel() {
  return (
    <div className="flex flex-col items-center justify-center px-page-x py-16 text-center" data-testid="submitting-panel">
      <i className="mdi mdi-loading mdi-spin text-[48px] text-primary" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-bold text-secondary">Submitting...</h2>
      <p className="mt-2 text-sm text-text-secondary">
        Please do not close the app while submitting.
      </p>
    </div>
  );
}
