import { useMemo, useRef, useState } from 'react';
import { mdiClose, mdiFileDelimitedOutline, mdiUploadOutline } from '@mdi/js';
import { parseCsvChain, type CsvChainRow } from '../sim/csvChainImport';
import { formatCurrency, type CurrencyCode } from '../types/model';
import { MdiIcon } from './MdiIcon';

interface CsvImportModalProps {
  currency: CurrencyCode;
  onClose: () => void;
  onImport: (rows: CsvChainRow[], mode: 'replace' | 'append') => void;
}

const SAMPLE = `item,cost,chance
Site survey,£12,500,40
Specialist contractor,£45,000,25
Regulatory delay,£18,000,15
Additional testing,£8,400,60`;

export function CsvImportModal({
  currency,
  onClose,
  onImport,
}: CsvImportModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [mode, setMode] = useState<'replace' | 'append'>('replace');

  const parsed = useMemo(() => parseCsvChain(rawText), [rawText]);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setRawText(await file.text());
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-sheet csv-import-modal"
        role="dialog"
        aria-labelledby="csv-import-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="modal-kicker">CSV Yes / No Chain</div>
            <h2 id="csv-import-title">Import Risk Register</h2>
          </div>
          <button
            type="button"
            className="btn-icon-danger"
            onClick={onClose}
            title="Close"
          >
            <MdiIcon path={mdiClose} size={16} />
          </button>
        </div>

        <p className="modal-lead">
          Each row becomes a Question with Yes/No outcomes. Columns:{' '}
          <code>item, cost, chance</code>. Quoted fields and currency symbols
          are accepted. Questions are chained with the aggregate ALL connector.
        </p>

        <div className="csv-import-grid">
          <div className="csv-import-source">
            <div className="csv-source-actions">
              <button
                type="button"
                className="btn btn-secondary btn-with-icon"
                onClick={() => fileRef.current?.click()}
              >
                <MdiIcon path={mdiFileDelimitedOutline} size={14} />
                <span>{fileName ? 'Replace File' : 'Upload CSV'}</span>
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setFileName(null);
                  setRawText(SAMPLE);
                }}
              >
                Load Sample
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = '';
                }}
              />
            </div>
            {fileName && <div className="csv-filename">{fileName}</div>}
            <label className="prop-field">
              <span>Or paste CSV rows</span>
              <textarea
                rows={10}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={'item,cost,chance\nFlood defence works,£22000,35'}
              />
            </label>
          </div>

          <div className="csv-import-preview">
            <div className="csv-preview-header">
              <strong>Preview</strong>
              <span>
                {parsed.validRows.length} valid
                {parsed.errors.length > 0
                  ? ` · ${parsed.errors.length} issue${
                      parsed.errors.length === 1 ? '' : 's'
                    }`
                  : ''}
              </span>
            </div>
            {parsed.rows.length === 0 ? (
              <div className="csv-preview-empty">
                Upload or paste a CSV to preview the Yes/No chain.
              </div>
            ) : (
              <div className="csv-preview-table-wrap">
                <table className="csv-preview-table">
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th>Yes Cost</th>
                      <th>Yes %</th>
                      <th>No %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map((row) => (
                      <tr
                        key={`${row.lineNumber}-${row.item}`}
                        className={row.error ? 'is-error' : ''}
                      >
                        <td>
                          {row.item || '—'}
                          {row.error && (
                            <div className="csv-row-error">{row.error}</div>
                          )}
                        </td>
                        <td>{formatCurrency(row.cost, currency)}</td>
                        <td>{row.chance}%</td>
                        <td>{Math.max(0, 100 - row.chance)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <fieldset className="csv-mode-fieldset">
          <legend>Import Mode</legend>
          <label className="csv-mode-option">
            <input
              type="radio"
              name="csv-mode"
              checked={mode === 'replace'}
              onChange={() => setMode('replace')}
            />
            <span>
              <strong>Replace current model</strong>
              <em>Builds a new Start → Yes/No chain → End graph.</em>
            </span>
          </label>
          <label className="csv-mode-option">
            <input
              type="radio"
              name="csv-mode"
              checked={mode === 'append'}
              onChange={() => setMode('append')}
            />
            <span>
              <strong>Append chain to canvas</strong>
              <em>
                Adds the questions beside the existing DAG and links Start / End
                when present.
              </em>
            </span>
          </label>
        </fieldset>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-with-icon"
            disabled={parsed.validRows.length === 0}
            onClick={() => {
              onImport(parsed.validRows, mode);
              onClose();
            }}
          >
            <MdiIcon path={mdiUploadOutline} size={15} />
            <span>
              Import {parsed.validRows.length} Question
              {parsed.validRows.length === 1 ? '' : 's'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
