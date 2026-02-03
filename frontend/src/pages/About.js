import React from "react";

function About() {
  return (
    <section className="gallery-shell">
      <div className="gallery-hero animate-fade-up">
        <p className="gallery-kicker">About</p>
        <h1 className="gallery-title">
          Whisk Studio — static web app
        </h1>
        <p className="gallery-subtitle mt-4">
          This is a simple static web app deployed to AWS with a Bedrock-backed
          API for image-to-video workflows. Designed for fast iteration,
          confident previews, and reliable job tracking.
        </p>
      </div>
    </section>
  );
}

export default About;
