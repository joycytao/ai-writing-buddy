import React from 'react';

const CloudReferenceSettings = ({
  cloudConnections,
  cloudConnectProvider,
  onCloudConnectProviderChange,
  linkDraft,
  onLinkDraftChange,
  onConnectProvider,
  onAddReference,
  featureOptions,
  isCloudStateReady,
  onOpenCloudBrowser,
  onCloseCloudBrowser,
  onEnterCloudFolder,
  onGoToCloudFolderFromPath,
  onSelectCloudResource,
  cloudBrowser,
  isBusy,
  actionError,
}) => {
  const hasConnectedService = cloudConnections.googleDrive || cloudConnections.oneDrive;

  const canAdd = Boolean(
    linkDraft.provider &&
    cloudConnections[linkDraft.provider] &&
    linkDraft.feature &&
    linkDraft.target.trim()
  );

  return (
    <div className="rounded-[2rem] border border-stone-200 bg-white p-5 space-y-4">
      {!isCloudStateReady && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
          Loading cloud references from your account...
        </div>
      )}

      {actionError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          {actionError}
        </div>
      )}

      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500 font-black">Cloud references</p>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Connect storage once, then map a file or folder to each learning feature.
        </p>
      </div>

      <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50 p-4 space-y-3">
        <p className="text-xs uppercase tracking-[0.24em] text-stone-500 font-black">1) Connect service</p>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <select
            value={cloudConnectProvider}
            onChange={(e) => onCloudConnectProviderChange(e.target.value)}
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
          >
            <option value="googleDrive">Google Drive</option>
            <option value="oneDrive">OneDrive</option>
          </select>

          <button
            onClick={() => onConnectProvider(cloudConnectProvider)}
            disabled={isBusy}
            className="rounded-[1.2rem] px-5 py-2.5 text-sm font-black uppercase tracking-[0.14em] bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {cloudConnections[cloudConnectProvider] ? 'Disconnect' : 'Connect'}
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 text-xs">
          <p className={`rounded-lg px-3 py-2 font-semibold ${cloudConnections.googleDrive ? 'bg-emerald-100 text-emerald-800' : 'bg-white text-stone-500 border border-stone-200'}`}>
            Google Drive: {cloudConnections.googleDrive ? 'Connected' : 'Not connected'}
          </p>
          <p className={`rounded-lg px-3 py-2 font-semibold ${cloudConnections.oneDrive ? 'bg-emerald-100 text-emerald-800' : 'bg-white text-stone-500 border border-stone-200'}`}>
            OneDrive: {cloudConnections.oneDrive ? 'Connected' : 'Not connected'}
          </p>
        </div>
      </div>

      {hasConnectedService && (
        <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50 p-4 space-y-3">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-500 font-black">2) Link reference</p>
          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={linkDraft.provider}
              onChange={(e) => onLinkDraftChange('provider', e.target.value)}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Provider</option>
              {cloudConnections.googleDrive && <option value="googleDrive">Google Drive</option>}
              {cloudConnections.oneDrive && <option value="oneDrive">OneDrive</option>}
            </select>

            <select
              value={linkDraft.feature}
              onChange={(e) => onLinkDraftChange('feature', e.target.value)}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Feature</option>
              {featureOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>

            <div className="md:col-span-2 grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                value={linkDraft.target}
                readOnly
                placeholder="Destination URL appears here after Browse > Select"
                className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={onOpenCloudBrowser}
                disabled={isBusy || !linkDraft.provider || !cloudConnections[linkDraft.provider]}
                className="rounded-[1.2rem] border border-stone-300 bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Browse
              </button>
            </div>
          </div>

          <button
            onClick={onAddReference}
            disabled={!canAdd || isBusy}
            className={`w-full rounded-[1.2rem] px-4 py-3 text-sm font-black uppercase tracking-[0.14em] ${canAdd ? 'bg-stone-900 text-white hover:bg-stone-800' : 'bg-stone-200 text-stone-400 cursor-not-allowed'}`}
          >
            Add Reference Link
          </button>
        </div>
      )}

      {!hasConnectedService && (
        <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-600">
          Connect at least one cloud service to unlock the Link section.
        </div>
      )}

      {cloudBrowser?.open && (
        <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-stone-200 bg-white shadow-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-500 font-black">Browse cloud</p>
                <p className="mt-1 text-base font-bold text-stone-800">{cloudBrowser.provider === 'googleDrive' ? 'Google Drive' : 'OneDrive'}</p>
              </div>
              <button onClick={onCloseCloudBrowser} className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-stone-600 hover:bg-stone-50">
                Close
              </button>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              {cloudBrowser.path.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => onGoToCloudFolderFromPath(entry.id)}
                  className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 font-semibold text-stone-700 hover:bg-stone-100"
                >
                  {entry.name}
                </button>
              ))}
            </div>

            {cloudBrowser.error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {cloudBrowser.error}
              </div>
            )}

            <div className="max-h-80 overflow-auto rounded-xl border border-stone-200 divide-y divide-stone-100">
              {cloudBrowser.isLoading && (
                <div className="px-4 py-3 text-sm text-stone-500">Loading...</div>
              )}

              {!cloudBrowser.isLoading && cloudBrowser.items.length === 0 && (
                <div className="px-4 py-3 text-sm text-stone-500">No items found in this folder.</div>
              )}

              {!cloudBrowser.isLoading && cloudBrowser.items.map((item) => (
                <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-stone-800">{item.name}</p>
                    <p className="text-xs text-stone-500 uppercase tracking-[0.14em]">{item.resourceType}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.resourceType === 'folder' && (
                      <button
                        onClick={() => onEnterCloudFolder(item)}
                        className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-stone-700 hover:bg-stone-50"
                      >
                        Open
                      </button>
                    )}
                    <button
                      onClick={() => onSelectCloudResource(item)}
                      className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-white hover:bg-stone-800"
                    >
                      Select
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CloudReferenceSettings;
