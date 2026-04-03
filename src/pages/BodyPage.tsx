import { Suspense, lazy } from 'react';
import { useHealthStore } from '../stores/healthStore';

const BodyVisualization = lazy(() => import('../components/Body/BodyVisualization'));

export default function BodyPage() {
  const { activeMemberId, familyMembers } = useHealthStore();
  const member = familyMembers.find(m => m.id === activeMemberId);

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">3D Body View</h1>
          <p className="view-subtitle">
            {member ? `${member.first_name}'s health mapped to body regions` : 'Select a family member'}
          </p>
        </div>
      </div>

      <div className="body-canvas-container">
        <Suspense fallback={<div className="loading-state">Loading 3D visualization...</div>}>
          <BodyVisualization />
        </Suspense>
      </div>
    </div>
  );
}
