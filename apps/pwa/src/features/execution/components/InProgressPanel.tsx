import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from './ProgressBar';
import { ChecklistItem } from './ChecklistItem';
import { AssetThumbnail } from './AssetThumbnail';
import { PhotoCapture } from './PhotoCapture';
import type { ChecklistTemplateItem, ChecklistResponse, AssetUploadState } from '../types';

interface InProgressPanelProps {
  checklistTemplate: ChecklistTemplateItem[];
  checklistResponses: ChecklistResponse[];
  onChecklistChange: (response: ChecklistResponse) => void;
  assets: AssetUploadState[];
  onAddPhoto: (file: File) => void;
  onDeleteAsset: (localId: string) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  onFinish: () => void;
  isComplete: boolean;
  uploadingCount?: number;
  requiredRemaining?: number;
}

type TabKey = 'checklist' | 'photos' | 'notes';

export function InProgressPanel({
  checklistTemplate,
  checklistResponses,
  onChecklistChange,
  assets,
  onAddPhoto,
  onDeleteAsset,
  notes,
  onNotesChange,
  onFinish,
  isComplete,
  uploadingCount = 0,
  requiredRemaining = 0,
}: InProgressPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('checklist');

  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'checklist', label: 'Checklist', icon: 'mdi-clipboard-check-outline' },
    { key: 'photos', label: 'Photos', icon: 'mdi-camera' },
    { key: 'notes', label: 'Notes', icon: 'mdi-text-box-outline' },
  ];

  const categories = [...new Set(checklistTemplate.map((i) => i.category))];

  const completedCount = checklistTemplate.filter((item) =>
    checklistResponses.some((r) => r.itemId === item.id && r.value !== null),
  ).length;
  const totalCount = checklistTemplate.length;
  const checklistProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  function getFinishButtonLabel(): string {
    if (uploadingCount > 0) return `Uploading photos... ${uploadingCount} remaining`;
    if (requiredRemaining > 0) return `${requiredRemaining} required items remaining`;
    return 'Proceed to Finish';
  }

  return (
    <div className="flex flex-col" data-testid="in-progress-panel">
      {totalCount > 0 && (
        <div className="px-page-x py-2 bg-card-bg" data-testid="checklist-progress">
          <ProgressBar
            progress={checklistProgress}
            label={`${completedCount} of ${totalCount} checklist items completed`}
          />
        </div>
      )}

      <div className="flex border-b border-border-subtle bg-card-bg">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex flex-1 min-h-touch items-center justify-center gap-1 text-xs font-bold transition-colors ${
              activeTab === tab.key
                ? 'border-b-2 border-primary text-primary'
                : 'text-text-muted'
            }`}
            data-testid={`tab-${tab.key}`}
          >
            <i className={`mdi ${tab.icon}`} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 px-page-x py-4">
        {activeTab === 'checklist' && (
          <div className="flex flex-col gap-4">
            {categories.map((category) => (
              <div key={category}>
                <h4 className="mb-2 text-xs font-bold uppercase text-text-secondary">{category}</h4>
                <div className="flex flex-col gap-2">
                  {checklistTemplate
                    .filter((i) => i.category === category)
                    .map((item) => (
                      <ChecklistItem
                        key={item.id}
                        item={item}
                        response={checklistResponses.find((r) => r.itemId === item.id)}
                        onChange={onChecklistChange}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'photos' && (
          <div className="flex flex-col gap-4">
            <PhotoCapture onCapture={onAddPhoto} count={assets.length} />
            <div className="flex flex-wrap gap-2">
              {assets.map((asset) => (
                <AssetThumbnail
                  key={asset.localId}
                  asset={asset}
                  onDelete={() => onDeleteAsset(asset.localId)}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'notes' && (
          <div>
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              maxLength={2000}
              placeholder="Add inspection notes..."
              className="min-h-[200px] w-full rounded-lg border border-border-subtle bg-card-bg p-4 text-sm text-text-primary outline-none focus:border-primary"
              data-testid="notes-textarea"
            />
            {notes.length >= 1800 && (
              <p className="mt-1 text-right text-xs text-text-muted" data-testid="notes-char-count">
                {notes.length}/2000
              </p>
            )}
          </div>
        )}
      </div>

      <div className="px-page-x pb-4">
        <Button
          variant="primary"
          disabled={!isComplete}
          onClick={onFinish}
          className="!w-full !min-h-[48px]"
          data-testid="proceed-to-finish-button"
        >
          {getFinishButtonLabel()}
        </Button>
      </div>
    </div>
  );
}
