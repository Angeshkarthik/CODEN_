import React from 'react';

interface FileTypeIconProps {
  filename?: string;
  extension?: string;
  size?: number;
  className?: string;
}

export const FileTypeIcon: React.FC<FileTypeIconProps> = ({
  filename = '',
  extension = '',
  size = 14,
  className = ''
}) => {
  const ext = (extension || (filename.includes('.') ? '.' + filename.split('.').pop() : '')).toLowerCase();
  const lowerName = filename.toLowerCase();

  // Markdown
  if (lowerName.endsWith('.md') || ext === '.md') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="2" y="4" width="20" height="16" rx="3" fill="#38BDF8" fillOpacity="0.15" stroke="#38BDF8" strokeWidth="1.5" />
        <path d="M6 15V9L9 12L12 9V15M16 9V15M14 13L16 15L18 13" stroke="#38BDF8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // JSON
  if (lowerName.endsWith('.json') || ext === '.json') {
    return (
      <span
        style={{
          fontFamily: "'Cascadia Code', Consolas, monospace",
          fontWeight: 700,
          color: '#E8A33D',
          fontSize: `${size}px`,
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: `${size}px`,
          height: `${size}px`
        }}
        className={className}
      >
        &#123;&#125;
      </span>
    );
  }

  // Java
  if (ext === '.java') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        {/* Steam trails */}
        <path d="M8.5 2.5C8 4 9.5 5 9 6.5C8.5 8 7 8.5 7.5 10" stroke="#F89820" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M12.5 3C12 4.3 13.5 5.3 13 6.8C12.5 8.2 11.2 8.7 11.6 10" stroke="#E76F00" strokeWidth="1.5" strokeLinecap="round" />
        {/* Cup body & handle */}
        <path d="M4.5 10.5H16.5V14.5C16.5 17 14.5 18.5 11.5 18.5H9.5C6.5 18.5 4.5 17 4.5 14.5V10.5Z" fill="#5382A1" />
        <path d="M16.5 11.5H18C19.2 11.5 20.2 12.5 20.2 13.7C20.2 14.9 19.2 15.9 18 15.9H16.5" stroke="#5382A1" strokeWidth="1.6" strokeLinecap="round" />
        {/* Saucer */}
        <path d="M3 20C6.5 21.5 14.5 21.5 18 20" stroke="#5382A1" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  // C++
  if (ext === '.cpp' || ext === '.cc' || ext === '.cxx' || ext === '.hpp') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <polygon points="12,2 21.5,7.5 21.5,16.5 12,22 2.5,16.5 2.5,7.5" fill="#00599C" />
        <path
          d="M9.8 8.8C9.2 8.1 8.4 7.8 7.5 7.8C5.8 7.8 4.6 9.3 4.6 12C4.6 14.7 5.8 16.2 7.5 16.2C8.4 16.2 9.2 15.9 9.8 15.2"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="M12.5 12H15.5M14 10.5V13.5" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M17.5 12H20.5M19 10.5V13.5" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }

  // C (and .h header files)
  if (ext === '.c' || ext === '.h') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <polygon points="12,2 21.5,7.5 21.5,16.5 12,22 2.5,16.5 2.5,7.5" fill="#00599C" />
        <path
          d="M15 8.5C14.2 7.5 13.2 7 12 7C9.2 7 7.2 9.2 7.2 12C7.2 14.8 9.2 17 12 17C13.2 17 14.2 16.5 15 15.5"
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // Python
  if (ext === '.py') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M11.5 3C7.5 3 7.5 4.8 7.5 4.8V6.6H12V7.5H5.2C3.4 7.5 2 9 2 11.2C2 13.5 3.3 14.1 4.5 14.1H5.8V12.3C5.8 10.5 7.3 9 9.1 9H13.6C14.7 9 15.7 8 15.7 6.8V4.8C15.7 3.6 14.3 3 11.5 3ZM9.8 4.4C10.3 4.4 10.7 4.8 10.7 5.3C10.7 5.8 10.3 6.2 9.8 6.2C9.3 6.2 8.9 5.8 8.9 5.3C8.9 4.8 9.3 4.4 9.8 4.4Z"
          fill="#3776AB"
        />
        <path
          d="M12.5 21C16.5 21 16.5 19.2 16.5 19.2V17.4H12V16.5H18.8C20.6 16.5 22 15 22 12.8C22 10.5 20.7 9.9 19.5 9.9H18.2V11.7C18.2 13.5 16.7 15 14.9 15H10.4C9.3 15 8.3 16 8.3 17.2V19.2C8.3 20.4 9.7 21 12.5 21ZM14.2 19.6C13.7 19.6 13.3 19.2 13.3 18.7C13.3 18.2 13.7 17.8 14.2 17.8C14.7 17.8 15.1 18.2 15.1 18.7C15.1 19.2 14.7 19.6 14.2 19.6Z"
          fill="#FFD43B"
        />
      </svg>
    );
  }

  // JavaScript
  if (ext === '.js' || ext === '.jsx' || ext === '.mjs') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect width="24" height="24" rx="3.5" fill="#F7DF1E" />
        <text
          x="12"
          y="17"
          textAnchor="middle"
          fill="#000000"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          fontWeight="900"
          fontSize="13"
          letterSpacing="-0.5"
        >
          JS
        </text>
      </svg>
    );
  }

  // Default File
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M13 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V9L13 2Z"
        stroke="var(--text-dim)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13 2V9H20" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};
