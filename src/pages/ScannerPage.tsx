import { useState, useRef } from 'react';
import { Camera, SwitchCamera, Utensils, Pill } from 'lucide-react';
import { useHealthStore, analyzeScanImage, type ScanResult } from '../stores/healthStore';

type ScanType = 'food' | 'medicine';

export default function ScannerPage() {
  const { activeMemberId, familyMembers, restrictions } = useHealthStore();
  const member = familyMembers.find(m => m.id === activeMemberId);
  const [scanType, setScanType] = useState<ScanType>('food');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('image/jpeg');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const confirmedRestrictions = restrictions.filter(r => r.confirmed);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageMimeType(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setCapturedImage(dataUrl);
      // Extract base64 without the data URL prefix
      setImageBase64(dataUrl.split(',')[1]);
      setResult(null);
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!imageBase64 || !activeMemberId) return;
    setAnalyzing(true);

    const scanResult = await analyzeScanImage(
      imageBase64,
      imageMimeType,
      scanType,
      activeMemberId,
      confirmedRestrictions.map(r => ({
        item_name: r.item_name,
        severity: r.severity,
        restriction_type: r.restriction_type,
        reaction: r.reaction,
      }))
    );

    if (scanResult) {
      setResult(scanResult);
    } else {
      setResult({
        item_name: 'Unknown',
        overall_result: 'caution',
        ingredients: [],
        flagged: [],
        explanation: 'Could not analyze this image. Make sure the AI backend is connected and try again.',
      });
    }
    setAnalyzing(false);
  };

  const resetScan = () => {
    setCapturedImage(null);
    setImageBase64(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Scanner</h1>
          <p className="view-subtitle">
            {member ? `Check food & medicine safety for ${member.first_name}` : 'Select a family member'}
          </p>
        </div>
      </div>

      <div className="scanner-type-toggle">
        <button className={`btn ${scanType === 'food' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setScanType('food')}>
          <Utensils size={14} /> Food
        </button>
        <button className={`btn ${scanType === 'medicine' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setScanType('medicine')}>
          <Pill size={14} /> Medicine
        </button>
      </div>

      {!capturedImage ? (
        <div className="scanner-capture-zone" onClick={() => fileInputRef.current?.click()}>
          <Camera size={48} />
          <p>Tap to take a photo of {scanType === 'food' ? 'food or its label' : 'medicine or its label'}</p>
          <p style={{ fontSize: 'var(--text-xs)', marginTop: '0.5rem', color: 'var(--color-tx-faint)' }}>
            AI will identify the item and check it against {member?.first_name ?? 'the member'}'s {confirmedRestrictions.length} restriction{confirmedRestrictions.length !== 1 ? 's' : ''}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCapture}
            style={{ display: 'none' }}
          />
        </div>
      ) : (
        <div className="scanner-preview">
          <img src={capturedImage} alt="Captured" className="scanner-preview-img" />
          <div className="scanner-preview-actions">
            <button className="btn btn-secondary" onClick={resetScan}>
              <SwitchCamera size={14} /> Retake
            </button>
            <button
              className="btn btn-primary"
              onClick={handleAnalyze}
              disabled={analyzing || !activeMemberId}
            >
              {analyzing ? 'Analyzing...' : `Check for ${member?.first_name ?? 'member'}`}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className={`scan-result scan-result-${result.overall_result}`}>
          <div className="scan-result-header">
            <h2>{result.overall_result === 'safe' ? 'SAFE' : result.overall_result === 'unsafe' ? 'UNSAFE' : 'CAUTION'}</h2>
            <p>{result.item_name}</p>
          </div>
          <div className="scan-result-body">
            {result.ingredients.length > 0 && (
              <div>
                <h4>Ingredients</h4>
                <div className="restriction-chips">
                  {result.ingredients.map((ing, i) => {
                    const isFlagged = result.flagged.some(f => f.ingredient.toLowerCase() === ing.toLowerCase());
                    return (
                      <span key={i} className={`badge ${isFlagged ? 'badge-error' : 'badge-muted'}`}>
                        {ing}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {result.flagged.length > 0 && (
              <div>
                <h4>Flagged Items</h4>
                {result.flagged.map((f, i) => (
                  <div key={i} className="flagged-item">
                    <strong>{f.ingredient}</strong> — {f.reason}
                    <span className={`badge badge-${f.severity === 'critical' ? 'error' : 'warning'}`} style={{ marginLeft: '0.5rem' }}>
                      {f.severity}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="scan-result-explanation">{result.explanation}</p>
          </div>
        </div>
      )}

      {confirmedRestrictions.length > 0 && (
        <div className="section" style={{ marginTop: '2rem' }}>
          <h3 className="section-title">Checking Against ({confirmedRestrictions.length} restrictions)</h3>
          <div className="restriction-chips">
            {confirmedRestrictions.map(r => (
              <span key={r.id} className={`badge badge-${r.severity === 'critical' ? 'error' : r.severity === 'warning' ? 'warning' : 'muted'}`}>
                {r.item_name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
