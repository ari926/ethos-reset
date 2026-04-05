import { useState, useRef, useEffect, useMemo } from 'react';
import { Camera, SwitchCamera, Utensils, Pill, Clock, CheckCircle, AlertTriangle, AlertOctagon } from 'lucide-react';
import { useHealthStore, analyzeScanImage, type ScanResult } from '../stores/healthStore';
import { supabase } from '../lib/supabase';
import type { HealthMetric, Treatment } from '../stores/healthStore';

type ScanType = 'food' | 'medicine';

interface ScanHistoryItem {
  id: string;
  scan_type: string;
  image_url: string | null;
  item_name: string | null;
  overall_result: string | null;
  ingredients: string[] | null;
  flagged: Array<{ ingredient: string; severity: string; reason: string }> | null;
  explanation: string | null;
  created_at: string;
}

export default function ScannerPage() {
  const { activeMemberId, familyMembers, restrictions, metrics, treatments } = useHealthStore();
  const member = familyMembers.find(m => m.id === activeMemberId);
  const [scanType, setScanType] = useState<ScanType>('food');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('image/jpeg');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const confirmedRestrictions = restrictions.filter(r => r.confirmed);

  // Build comprehensive health context for thorough safety checking
  const fullHealthContext = useMemo(() => {
    const lines: string[] = [];

    // 1. Food sensitivities from P88 / IgG data
    const foodSensitivities = metrics.filter((m: HealthMetric) => {
      const src = (m.source ?? '').toLowerCase();
      const unit = (m.metric_unit ?? '').toLowerCase();
      const region = (m.body_region ?? '').toLowerCase();
      return src.includes('p88') || src.includes('antigen') || src.includes('food') || unit.includes('u/ml') || region === 'immune';
    });
    if (foodSensitivities.length > 0) {
      const highFoods = foodSensitivities.filter((m: HealthMetric) => Number(m.metric_value) >= 25);
      const modFoods = foodSensitivities.filter((m: HealthMetric) => Number(m.metric_value) >= 15 && Number(m.metric_value) < 25);
      if (highFoods.length > 0) {
        lines.push(`HIGH REACTIVITY FOODS (IgG ≥25 U/mL — immune system actively reacting): ${highFoods.map((m: HealthMetric) => `${m.metric_name} (${m.metric_value} U/mL)`).join(', ')}`);
      }
      if (modFoods.length > 0) {
        lines.push(`MODERATE REACTIVITY FOODS (IgG 15-25 U/mL): ${modFoods.map((m: HealthMetric) => `${m.metric_name} (${m.metric_value} U/mL)`).join(', ')}`);
      }
    }

    // 2. Genetic drug metabolism variants
    const geneticMetrics = metrics.filter((m: HealthMetric) => {
      const src = (m.source ?? '').toLowerCase();
      const region = (m.body_region ?? '').toLowerCase();
      return src.includes('3x4') || src.includes('genetic') || src.includes('pharmaco') || region === 'genetic';
    });
    if (geneticMetrics.length > 0) {
      const drugMetabolism = geneticMetrics.filter((m: HealthMetric) => {
        const name = m.metric_name.toLowerCase();
        return /cyp|nat2|ugt|sult|dpyd|slco|abcb|vkorc/i.test(name);
      });
      if (drugMetabolism.length > 0) {
        lines.push(`GENETIC DRUG METABOLISM VARIANTS (affects how body processes medications): ${drugMetabolism.map((m: HealthMetric) => `${m.metric_name}: ${m.metric_unit ?? ''} (${m.status ?? 'unknown'})`).join(', ')}`);
      }
      const methylation = geneticMetrics.filter((m: HealthMetric) => {
        const name = m.metric_name.toLowerCase();
        return /mthfr|comt|cbs|mtr|bhmt/i.test(name);
      });
      if (methylation.length > 0) {
        lines.push(`METHYLATION VARIANTS (affects B vitamin and folate processing): ${methylation.map((m: HealthMetric) => `${m.metric_name}: ${m.metric_unit ?? ''} (${m.status ?? 'unknown'})`).join(', ')}`);
      }
    }

    // 3. Active infections
    const infectionMetrics = metrics.filter((m: HealthMetric) => {
      const name = m.metric_name.toLowerCase();
      return (name.includes('babesia') || name.includes('bartonella') || name.includes('lyme') ||
              name.includes('borrelia') || name.includes('ehrlichia') || name.includes('anaplasma') ||
              name.includes('strep') || name.includes('aso') || name.includes('anti-dnase')) &&
             (m.status === 'high' || m.status === 'critical');
    });
    if (infectionMetrics.length > 0) {
      lines.push(`ACTIVE/ELEVATED INFECTION MARKERS: ${infectionMetrics.map((m: HealthMetric) => `${m.metric_name}: ${m.metric_value} ${m.metric_unit ?? ''} (${m.status})`).join(', ')}`);
    }

    // 4. Current treatments (drug-drug and drug-food interactions)
    const activeTreatments = (treatments ?? []).filter((t: Treatment) => t.is_active);
    if (activeTreatments.length > 0) {
      lines.push(`CURRENT MEDICATIONS & SUPPLEMENTS (check for interactions): ${activeTreatments.map((t: Treatment) => `${t.name}${t.dosage ? ' ' + t.dosage : ''}${t.frequency ? ' ' + t.frequency : ''}`).join(', ')}`);
    }

    // 5. Flagged metabolic/organ markers
    const flaggedMetrics = metrics.filter((m: HealthMetric) => (m.status === 'high' || m.status === 'critical' || m.status === 'low'));
    const liverIssues = flaggedMetrics.filter((m: HealthMetric) => (m.body_region ?? '').toLowerCase() === 'liver');
    const kidneyIssues = flaggedMetrics.filter((m: HealthMetric) => (m.body_region ?? '').toLowerCase() === 'kidneys');
    const gutIssues = flaggedMetrics.filter((m: HealthMetric) => {
      const name = m.metric_name.toLowerCase();
      return name.includes('zonulin') || (m.body_region ?? '').toLowerCase() === 'stomach' || (m.body_region ?? '').toLowerCase() === 'abdomen';
    });

    if (liverIssues.length > 0) {
      lines.push(`LIVER FUNCTION CONCERNS: ${liverIssues.map((m: HealthMetric) => `${m.metric_name}: ${m.metric_value} ${m.metric_unit ?? ''} (${m.status})`).join(', ')}`);
    }
    if (kidneyIssues.length > 0) {
      lines.push(`KIDNEY FUNCTION CONCERNS: ${kidneyIssues.map((m: HealthMetric) => `${m.metric_name}: ${m.metric_value} ${m.metric_unit ?? ''} (${m.status})`).join(', ')}`);
    }
    if (gutIssues.length > 0) {
      lines.push(`GUT HEALTH CONCERNS: ${gutIssues.map((m: HealthMetric) => `${m.metric_name}: ${m.metric_value} ${m.metric_unit ?? ''} (${m.status})`).join(', ')}`);
    }

    // 6. Manual restrictions/allergies
    if (confirmedRestrictions.length > 0) {
      lines.push(`CONFIRMED ALLERGIES & RESTRICTIONS: ${confirmedRestrictions.map(r => `${r.item_name} (${r.restriction_type}, ${r.severity}${r.reaction ? ', reaction: ' + r.reaction : ''})`).join(', ')}`);
    }

    return lines.join('\n\n');
  }, [metrics, treatments, confirmedRestrictions]);

  // Load scan history
  useEffect(() => {
    if (!activeMemberId) return;
    loadHistory();
  }, [activeMemberId]);

  const loadHistory = async () => {
    if (!activeMemberId) return;
    const { data } = await supabase
      .from('scan_history')
      .select('*')
      .eq('member_id', activeMemberId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setHistory(data);
  };

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageMimeType(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setCapturedImage(dataUrl);
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
      })),
      fullHealthContext
    );

    const finalResult = scanResult ?? {
      item_name: 'Unknown',
      overall_result: 'caution' as const,
      ingredients: [],
      flagged: [],
      explanation: 'Could not analyze this image. Try again.',
    };

    setResult(finalResult);
    setAnalyzing(false);

    // Save to history — upload image to storage first
    try {
      const ext = imageMimeType.includes('png') ? 'png' : 'jpg';
      const fileName = `${activeMemberId}/${Date.now()}.${ext}`;

      // Convert base64 to blob for upload
      const byteChars = atob(imageBase64);
      const byteArr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArr], { type: imageMimeType });

      const { data: uploadData } = await supabase.storage
        .from('scan-images')
        .upload(fileName, blob, { contentType: imageMimeType });

      let imageUrl: string | null = null;
      if (uploadData?.path) {
        const { data: urlData } = supabase.storage.from('scan-images').getPublicUrl(uploadData.path);
        imageUrl = urlData?.publicUrl ?? null;
      }

      await supabase.from('scan_history').insert({
        member_id: activeMemberId,
        scan_type: scanType,
        image_url: imageUrl,
        item_name: finalResult.item_name,
        overall_result: finalResult.overall_result,
        ingredients: finalResult.ingredients,
        flagged: finalResult.flagged,
        explanation: finalResult.explanation,
      });

      loadHistory();
    } catch (err) {
      console.error('Failed to save scan history:', err);
    }
  };

  const resetScan = () => {
    setCapturedImage(null);
    setImageBase64(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resultIcon = (r: string | null) => {
    if (r === 'safe') return <CheckCircle size={16} style={{ color: 'var(--color-success)' }} />;
    if (r === 'unsafe') return <AlertOctagon size={16} style={{ color: 'var(--color-error)' }} />;
    return <AlertTriangle size={16} style={{ color: 'var(--color-warning)' }} />;
  };

  const resultColor = (r: string | null) => {
    if (r === 'safe') return 'var(--color-success)';
    if (r === 'unsafe') return 'var(--color-error)';
    return 'var(--color-warning)';
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

      {/* Scan History */}
      {history.length > 0 && (
        <div className="section" style={{ marginTop: '2rem' }}>
          <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={16} />
            Scan History ({history.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {history.map(item => {
              const isExpanded = expandedHistoryId === item.id;
              return (
                <div
                  key={item.id}
                  style={{
                    background: 'var(--color-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-divider)',
                    overflow: 'hidden',
                    cursor: 'pointer',
                  }}
                  onClick={() => setExpandedHistoryId(isExpanded ? null : item.id)}
                >
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem',
                  }}>
                    {/* Thumbnail */}
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.item_name ?? 'Scan'}
                        style={{ width: 48, height: 48, borderRadius: 'var(--radius-sm)', objectFit: 'cover', flexShrink: 0 }}
                      />
                    ) : (
                      <div style={{
                        width: 48, height: 48, borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-offset)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {item.scan_type === 'food' ? <Utensils size={18} /> : <Pill size={18} />}
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {resultIcon(item.overall_result)}
                        <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{item.item_name ?? 'Unknown'}</span>
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)', marginTop: 2 }}>
                        {item.scan_type === 'food' ? '🍽️' : '💊'} {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>

                    <span style={{
                      fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', padding: '0.15rem 0.5rem',
                      borderRadius: '4px', color: '#fff', background: resultColor(item.overall_result),
                    }}>
                      {item.overall_result ?? '?'}
                    </span>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid var(--color-divider)' }}>
                      {item.image_url && (
                        <img
                          src={item.image_url}
                          alt={item.item_name ?? 'Scan'}
                          style={{ width: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 'var(--radius-md)', margin: '0.75rem 0' }}
                        />
                      )}
                      {item.explanation && (
                        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-tx-muted)', lineHeight: 1.5, margin: '0.5rem 0' }}>
                          {item.explanation}
                        </p>
                      )}
                      {item.ingredients && item.ingredients.length > 0 && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-tx-muted)' }}>Ingredients: </span>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)' }}>
                            {item.ingredients.join(', ')}
                          </span>
                        </div>
                      )}
                      {item.flagged && (item.flagged as Array<{ ingredient: string; severity: string; reason: string }>).length > 0 && (
                        <div style={{ marginTop: '0.5rem' }}>
                          {(item.flagged as Array<{ ingredient: string; severity: string; reason: string }>).map((f, i) => (
                            <div key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)', marginTop: '0.25rem' }}>
                              ⚠️ <strong>{f.ingredient}</strong>: {f.reason}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
