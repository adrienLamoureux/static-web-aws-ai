import React from 'react';
import { useSearchParams } from 'react-router-dom';
import Whisk from './Whisk';
import WhiskVideos from './WhiskVideos';

export default function Forge() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'videos' ? 'videos' : 'images';

  return (
    <div>
      <div className="yk-page-header">
        <h2 className="yk-page-title">Forge</h2>
        <p className="yk-page-subtitle">Generate images and animate videos</p>
      </div>
      <div className="yk-tab-bar">
        <button
          type="button"
          className={`yk-tab${tab === 'images' ? ' is-active' : ''}`}
          onClick={() => setParams({ tab: 'images' })}
        >
          Images
        </button>
        <button
          type="button"
          className={`yk-tab${tab === 'videos' ? ' is-active' : ''}`}
          onClick={() => setParams({ tab: 'videos' })}
        >
          Videos
        </button>
      </div>
      {tab === 'videos' ? <WhiskVideos /> : <Whisk />}
    </div>
  );
}
