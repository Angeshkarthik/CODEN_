import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { LANGUAGE_CONFIGS } from '../../electron/languages';
import { EditorDocument } from '../../electron/types';
import { FileTypeIcon } from '../FileTree/FileTypeIcon';

interface NewFileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (language: string, fileName: string) => void;
  initialLanguage?: string;
  existingDocs: EditorDocument[];
}

const DEFAULT_FILENAMES: Record<string, string> = {
  java: 'Main.java',
  c: 'main.c',
  cpp: 'main.cpp',
  python: 'main.py',
  javascript: 'main.js'
};

export const getSuggestedFileName = (langId: string, existingDocs: EditorDocument[]): string => {
  const baseDefault = DEFAULT_FILENAMES[langId] || 'Main.java';
  const dotIndex = baseDefault.lastIndexOf('.');
  const baseName = dotIndex !== -1 ? baseDefault.slice(0, dotIndex) : baseDefault;
  const ext = dotIndex !== -1 ? baseDefault.slice(dotIndex) : '';

  const existingNames = new Set(existingDocs.map((d) => d.fileName.toLowerCase()));
  if (!existingNames.has(baseDefault.toLowerCase())) {
    return baseDefault;
  }

  let counter = 2;
  while (existingNames.has(`${baseName}-${counter}${ext}`.toLowerCase())) {
    counter++;
  }
  return `${baseName}-${counter}${ext}`;
};

export const NewFileDialog: React.FC<NewFileDialogProps> = ({
  isOpen,
  onClose,
  onCreate,
  initialLanguage = 'java',
  existingDocs
}) => {
  const [selectedLang, setSelectedLang] = useState<string>(initialLanguage);
  const [fileName, setFileName] = useState<string>('');
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const lang = initialLanguage && LANGUAGE_CONFIGS[initialLanguage] ? initialLanguage : 'java';
      setSelectedLang(lang);
      setFileName(getSuggestedFileName(lang, existingDocs));
      setIsLangDropdownOpen(false);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, initialLanguage, existingDocs]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsLangDropdownOpen(false);
      }
    };
    if (isLangDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isLangDropdownOpen]);

  if (!isOpen) return null;

  const handleLanguageSelect = (langId: string) => {
    setSelectedLang(langId);
    setFileName(getSuggestedFileName(langId, existingDocs));
    setIsLangDropdownOpen(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleConfirm = () => {
    const trimmed = fileName.trim();
    const finalName = trimmed || getSuggestedFileName(selectedLang, existingDocs);
    onCreate(selectedLang, finalName);
  };

  const currentLangConfig = LANGUAGE_CONFIGS[selectedLang] || LANGUAGE_CONFIGS.java;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-file-dialog-title"
    >
      <div
        className="modal-content-card new-file-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '420px', maxWidth: '92vw' }}
      >
        {/* Header */}
        <div className="modal-card-header">
          <span id="new-file-dialog-title" className="modal-card-title">
            New File
          </span>
          <button className="icon-action-btn" onClick={onClose} title="Cancel">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Language selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-dim)',
                textTransform: 'uppercase',
                letterSpacing: '0.4px'
              }}
            >
              Language
            </label>
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <button
                type="button"
                className="new-file-lang-select-btn"
                onClick={() => setIsLangDropdownOpen((prev) => !prev)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 12px',
                  backgroundColor: 'var(--bg-toolbar)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: 'var(--text-bright)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileTypeIcon filename={currentLangConfig.fileName} size={16} />
                  <span style={{ fontWeight: 600 }}>{currentLangConfig.name}</span>
                </div>
                <ChevronDown size={14} style={{ color: 'var(--text-dim)' }} />
              </button>

              {isLangDropdownOpen && (
                <div
                  className="lang-menu-dropdown"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    width: '100%',
                    boxSizing: 'border-box',
                    zIndex: 1000
                  }}
                >
                  {Object.values(LANGUAGE_CONFIGS).map((lang) => (
                    <button
                      key={lang.id}
                      type="button"
                      className={'lang-menu-item' + (selectedLang === lang.id ? ' active' : '')}
                      onClick={() => handleLanguageSelect(lang.id)}
                    >
                      <span className="lang-menu-icon">
                        <FileTypeIcon filename={lang.fileName} size={15} />
                      </span>
                      <span className="lang-menu-name">{lang.name}</span>
                      {selectedLang === lang.id && (
                        <span className="lang-menu-active-dot" aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Filename input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              htmlFor="new-file-name-input"
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-dim)',
                textTransform: 'uppercase',
                letterSpacing: '0.4px'
              }}
            >
              File name
            </label>
            <input
              id="new-file-name-input"
              ref={inputRef}
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirm();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onClose();
                }
              }}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-input-field, #12100E)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-bright)',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                outline: 'none',
                transition: 'border-color 0.15s ease'
              }}
            />
          </div>
        </div>

        {/* Footer actions */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            backgroundColor: 'rgba(0, 0, 0, 0.15)'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              background: 'transparent',
              color: 'var(--text-main)',
              fontSize: '12.5px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.12s ease'
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              padding: '6px 18px',
              borderRadius: '6px',
              border: 'none',
              background: 'var(--color-primary)',
              color: '#141210',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.12s ease'
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
};
