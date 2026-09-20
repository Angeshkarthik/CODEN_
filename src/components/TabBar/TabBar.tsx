import React, { useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { EditorDocument } from '../../electron/types';
import { FileTypeIcon } from '../FileTree/FileTypeIcon';

interface TabBarProps {
  documents: EditorDocument[];
  activeDocumentId: string;
  onSelectTab: (docId: string) => void;
  onCloseTab: (docId: string, e: React.MouseEvent) => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  documents,
  activeDocumentId,
  onSelectTab,
  onCloseTab
}) => {
  const activeTabRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      });
    }
  }, [activeDocumentId]);

  return (
    <div className="tab-bar-container">
      {documents.map((doc) => {
        const isActive = doc.id === activeDocumentId;
        return (
          <div
            key={doc.id}
            ref={isActive ? activeTabRef : undefined}
            className={`tab-bar-item ${isActive ? 'active' : ''}`}
            onClick={() => onSelectTab(doc.id)}
            title={doc.filePath || doc.fileName || 'Unsaved Document'}
          >
            <span className="tab-icon">
              <FileTypeIcon filename={doc.fileName} size={14} />
            </span>
            <span className="tab-title" title={doc.fileName}>{doc.fileName}</span>
            {doc.isDirty ? (
              <span className="tab-status-dot dirty" title="Unsaved changes" />
            ) : isActive ? (
              <span className="tab-status-dot saved" title="Saved" />
            ) : null}
            <button
              className="tab-close-btn"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(doc.id, e);
              }}
              title="Close File"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
