import React from "react";

function About() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 pb-16 pt-8 md:px-10">
      <div className="glass-panel animate-fade-up rounded-3xl p-8 shadow-soft md:p-12">
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">
          About
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-ink md:text-4xl">
          Static web + Bedrock experiments
        </h1>
        <p className="mt-4 max-w-2xl text-base text-slate-600 md:text-lg">
          This is a simple React app deployed to AWS with a Bedrock-backed API
          for image-to-video workflows. Designed for fast iteration, confident
          previews, and reliable job tracking.
        </p>
      </div>
    </section>
  );
}

export default About;
