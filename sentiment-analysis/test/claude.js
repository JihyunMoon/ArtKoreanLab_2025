import React, { useState, useEffect } from 'react';
import { Monitor, Heart, BookOpen, Send, RotateCcw, Maximize } from 'lucide-react';

const InteractivePoetryWalls = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentCycle, setCurrentCycle] = useState(0);
  const [leftWallImage, setLeftWallImage] = useState(null);
  const [rightWallImage, setRightWallImage] = useState(null);
  const [generatedPoem, setGeneratedPoem] = useState('');
  const [audienceSentiment, setAudienceSentiment] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [cycleHistory, setCycleHistory] = useState([]);
  
  // Movie dataset for keyword extraction
  const movieDataset = [
    {
      title: "Blade Runner 2049",
      keywords: ["neon", "cyberpunk", "rain-soaked", "dystopian", "philosophical"],
      sentiment: "melancholic",
      reviewer_fragment: "haunting cinematography that lingers in memory"
    },
    {
      title: "Mad Max: Fury Road", 
      keywords: ["desert", "chrome", "explosive", "survival", "adrenaline"],
      sentiment: "euphoric",
      reviewer_fragment: "explosive action sequences with emotional depth"
    },
    {
      title: "Her",
      keywords: ["intimate", "soft light", "urban loneliness", "technological", "warm"],
      sentiment: "melancholic", 
      reviewer_fragment: "melancholic atmosphere pervades every frame"
    },
    {
      title: "Dune",
      keywords: ["sand", "epic", "mystical", "desert", "spice"],
      sentiment: "mysterious",
      reviewer_fragment: "otherworldly landscapes capture imagination"
    },
    {
      title: "Parasite",
      keywords: ["stairs", "basement", "class", "tension", "architecture"],
      sentiment: "dark",
      reviewer_fragment: "architectural metaphors create visual poetry"
    }
  ];

  // Generate poem from keywords
  const generatePoemFromKeywords = (keywords, movieTitle, sentiment) => {
    const poemTemplates = {
      melancholic: [
        `In the ${keywords[0]} of memory,
${keywords[1]} whispers fade,
${keywords[2]} dreams linger,
Where ${movieTitle} once played.`,
        
        `Through ${keywords[0]} and ${keywords[1]},
Shadows of ${keywords[2]} remain,
${movieTitle} echoes softly,
In cinema's gentle rain.`
      ],
      euphoric: [
        `${keywords[0]} blazes bright,
${keywords[1]} dances wild,
${keywords[2]} explodes with joy,
${movieTitle}'s vision, unreconciled.`,
        
        `Burst of ${keywords[0]}, 
Surge of ${keywords[1]},
${keywords[2]} celebration,
${movieTitle} breaks the chain.`
      ],
      dark: [
        `${keywords[0]} consumes the light,
${keywords[1]} breeds in shadow,
${keywords[2]} cuts deep,
Where ${movieTitle} fears to follow.`,
        
        `In depths of ${keywords[0]},
${keywords[1]} grows strong,
${keywords[2]} judgment waits,
${movieTitle}'s dark song.`
      ],
      mysterious: [
        `Beyond ${keywords[0]} lies truth,
${keywords[1]} holds secrets deep,
${keywords[2]} awakens slowly,
Where ${movieTitle} spirits sleep.`,
        
        `${keywords[0]} shifts and changes,
${keywords[1]} bends reality,
${keywords[2]} reveals all,
${movieTitle}'s mystery.`
      ]
    };
    
    const templates = poemTemplates[sentiment] || poemTemplates.mysterious;
    return templates[Math.floor(Math.random() * templates.length)];
  };

  // Create ComfyUI optimized prompts from movie data
  const createComfyUIPrompts = (movieTitle, keywords, sentiment, reviewerFragment) => {
    const moodDefinitions = {
      euphoric: {
        atmosphere: "uplifting energy, celebration of life, vibrant positivity, dynamic movement",
        emotion: "joy, triumph, liberation, euphoria, exhilaration",
        lighting: "golden hour warmth, radiant sunlight, bright illumination"
      },
      melancholic: {
        atmosphere: "contemplative solitude, gentle sadness, nostalgic longing, quiet introspection", 
        emotion: "bittersweet memories, wistful yearning, tender sorrow, peaceful melancholy",
        lighting: "soft diffused light, twilight glow, muted illumination"
      },
      dark: {
        atmosphere: "ominous tension, shadowy mystery, urban decay, psychological depth",
        emotion: "anxiety, fear, suspense, existential dread, inner conflict", 
        lighting: "dramatic chiaroscuro, harsh contrasts, moody darkness"
      },
      mysterious: {
        atmosphere: "enigmatic ambiance, surreal dreamscape, otherworldly presence, hidden depths",
        emotion: "wonder, curiosity, mystical awe, transcendent mystery",
        lighting: "ethereal glow, mystical illumination, supernatural radiance"
      }
    };

    const styleGuides = {
      photography: "photorealistic, professional photography, cinematic composition, depth of field, film grain texture, authentic lighting, human emotion captured, documentary style realism",
      graphicNovel: "graphic novel aesthetic, bold line art, stylized illustration, dramatic visual storytelling, comic book composition, enhanced contrast, artistic interpretation, sequential art influence"
    };

    const currentMood = moodDefinitions[sentiment];
    const baseKeywords = keywords.join(', ');
    const corePrompt = `"${movieTitle}" cinematic interpretation, ${baseKeywords}, ${currentMood.atmosphere}, ${currentMood.emotion}, ${currentMood.lighting}`;
    
    return {
      movieTitle,
      keywords,
      sentiment,
      moodDefinition: currentMood,
      corePrompt,
      leftWall: {
        style: 'Sensual Realistic Photography',
        prompt: `${corePrompt}

${styleGuides.photography}, sensual realistic photography, emotional depth, human connection, intimate perspective, naturalistic textures, authentic moments

reviewer inspiration: "${reviewerFragment}"

technical: 85mm lens, natural lighting, shallow depth of field, film photography aesthetic, professional color grading, masterpiece quality, 8k resolution`,
        focus: 'authentic human emotion and cinematic realism'
      },
      rightWall: {
        style: 'Graphic Novel Aesthetic', 
        prompt: `${corePrompt}

${styleGuides.graphicNovel}, stylized visual narrative, bold artistic expression, dramatic composition, enhanced storytelling, graphic design elements, illustrative interpretation

reviewer inspiration: "${reviewerFragment}"

technical: graphic novel style, bold colors, strong line work, artistic stylization, visual storytelling, comic book aesthetic, high contrast, detailed illustration`,
        focus: 'stylized artistic interpretation and visual narrative'
      }
    };
  };

  // Generate connected wall images using ComfyUI prompts
  const generateConnectedImages = async (promptData, audienceInput = '') => {
    setIsGenerating(true);
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const leftPrompt = audienceInput ? 
      `${promptData.leftWall.prompt}\n\naudience emotional response: "${audienceInput}"` : 
      promptData.leftWall.prompt;
      
    const rightPrompt = audienceInput ? 
      `${promptData.rightWall.prompt}\n\naudience emotional response: "${audienceInput}"` : 
      promptData.rightWall.prompt;
    
    const leftImage = {
      id: Date.now() + 1,
      prompt: leftPrompt,
      style: promptData.leftWall.style,
      url: generateSVGImage(leftPrompt, 'left', promptData.sentiment),
      side: 'left'
    };
    
    const rightImage = {
      id: Date.now() + 2,
      prompt: rightPrompt,  
      style: promptData.rightWall.style,
      url: generateSVGImage(rightPrompt, 'right', promptData.sentiment),
      side: 'right'
    };
    
    setLeftWallImage(leftImage);
    setRightWallImage(rightImage);
    setIsGenerating(false);
    
    return { leftImage, rightImage, promptData };
  };

  // Generate SVG placeholder (replace with actual ComfyUI integration)
  const generateSVGImage = (prompt, side, sentiment) => {
    const colors = {
      left: {
        euphoric: ['#f59e0b', '#fbbf24', '#fde047'],
        melancholic: ['#3b82f6', '#60a5fa', '#93c5fd'], 
        dark: ['#7c2d12', '#dc2626', '#991b1b'],
        mysterious: ['#4c1d95', '#7c3aed', '#a855f7']
      },
      right: {
        euphoric: ['#ea580c', '#fb923c', '#fdba74'],
        melancholic: ['#0f766e', '#14b8a6', '#5eead4'],
        dark: ['#4c1d95', '#6b21a8', '#7c2d12'],  
        mysterious: ['#059669', '#10b981', '#34d399']
      }
    };
    
    const sideColors = colors[side][sentiment];
    const styleInfo = side === 'left' ? 'Photography Style' : 'Graphic Novel Style';
    
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad${side}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${sideColors[0]};stop-opacity:1" />
            <stop offset="50%" style="stop-color:${sideColors[1]};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${sideColors[2]};stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad${side})"/>
        <text x="50%" y="30%" font-family="serif" font-size="36" fill="white" text-anchor="middle" dy=".3em" font-weight="bold">
          ${side.toUpperCase()} WALL
        </text>
        <text x="50%" y="40%" font-family="sans-serif" font-size="18" fill="rgba(255,255,255,0.9)" text-anchor="middle" dy=".3em">
          ${styleInfo}
        </text>
        <text x="50%" y="50%" font-family="sans-serif" font-size="16" fill="rgba(255,255,255,0.8)" text-anchor="middle" dy=".3em">
          ${sentiment.toUpperCase()} MOOD
        </text>
        <text x="50%" y="65%" font-family="monospace" font-size="12" fill="rgba(255,255,255,0.7)" text-anchor="middle" dy=".3em">
          Cycle ${Math.floor(Date.now() / 1000) % 999}
        </text>
      </svg>
    `)}`;
  };

  // Start new poetry cycle
  const startNewCycle = async () => {
    const randomMovie = movieDataset[Math.floor(Math.random() * movieDataset.length)];
    
    const shuffledKeywords = [...randomMovie.keywords].sort(() => 0.5 - Math.random());
    const selectedKeywords = shuffledKeywords.slice(0, 3 + Math.floor(Math.random() * 2));
    
    const promptData = createComfyUIPrompts(
      randomMovie.title, 
      selectedKeywords, 
      randomMovie.sentiment, 
      randomMovie.reviewer_fragment
    );
    
    const images = await generateConnectedImages(promptData);
    
    const poem = generatePoemFromKeywords(selectedKeywords, randomMovie.title, randomMovie.sentiment);
    setGeneratedPoem(poem);
    
    setCurrentCycle(prev => prev + 1);
    setCycleHistory(prev => [...prev.slice(-4), {
      cycle: currentCycle + 1,
      movie: randomMovie,
      keywords: selectedKeywords,
      promptData: promptData,
      poem: poem,
      audienceInput: '',
      images: images
    }]);
    
    setAudienceSentiment('');
  };

  // Add audience sentiment and regenerate
  const addAudienceSentiment = async () => {
    if (!audienceSentiment.trim()) return;
    
    const lastCycle = cycleHistory[cycleHistory.length - 1];
    if (!lastCycle) return;
    
    const images = await generateConnectedImages(lastCycle.promptData, audienceSentiment);
    
    setCycleHistory(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = {
        ...lastCycle,
        audienceInput: audienceSentiment,
        images: images
      };
      return updated;
    });
    
    setTimeout(() => {
      startNewCycle();
    }, 5000);
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    startNewCycle();
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      
      {/* Control Panel */}
      {!isFullscreen && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-black/95 border-b border-purple-800">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-purple-400">Interactive Poetry Walls</h1>
              <div className="text-sm text-gray-400">
                Cycle #{currentCycle} | Connected Generation
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={startNewCycle}
                disabled={isGenerating}
                className="p-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              
              <button
                onClick={toggleFullscreen}
                className="p-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <Maximize className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Display - 3D Room View */}
      <div className={`${isFullscreen ? 'h-screen' : 'h-screen pt-16'} relative overflow-hidden`} style={{ perspective: '1000px' }}>
        
        {/* Room Container */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-full h-full max-w-6xl mx-auto">
            
            {/* Left Wall - Angled for corner perspective */}
            <div 
              className="absolute top-0 bottom-0 left-0 w-1/2 transform-gpu transition-all duration-1000"
              style={{
                transformOrigin: 'right center',
                transform: 'rotateY(-25deg) translateX(-10%)',
                transformStyle: 'preserve-3d'
              }}
            >
              {leftWallImage ? (
                <div className="relative w-full h-full">
                  <img 
                    src={leftWallImage.url} 
                    alt="Left Wall Generation"
                    className="w-full h-full object-cover rounded-r-lg shadow-2xl"
                    style={{ 
                      filter: 'brightness(0.9) contrast(1.1)',
                      boxShadow: '20px 0 40px rgba(0,0,0,0.5)'
                    }}
                  />
                  {/* Left Wall Frame Effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/20 rounded-r-lg"></div>
                  
                  {/* Wall Info Overlay */}
                  {!isFullscreen && (
                    <div className="absolute bottom-6 left-6 bg-black/70 backdrop-blur-sm rounded-lg p-3 max-w-xs">
                      <h4 className="text-sm font-semibold text-purple-300 mb-1">Left Wall</h4>
                      <p className="text-xs text-gray-300">{leftWallImage.style}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-purple-900 to-purple-700 flex items-center justify-center rounded-r-lg shadow-2xl">
                  {isGenerating ? (
                    <div className="text-center">
                      <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-white">Generating Left Wall...</p>
                    </div>
                  ) : (
                    <div className="text-center text-purple-200">
                      <Monitor className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p>Left Wall Ready</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Wall - Angled for corner perspective */}
            <div 
              className="absolute top-0 bottom-0 right-0 w-1/2 transform-gpu transition-all duration-1000"
              style={{
                transformOrigin: 'left center',
                transform: 'rotateY(25deg) translateX(10%)',
                transformStyle: 'preserve-3d'
              }}
            >
              {rightWallImage ? (
                <div className="relative w-full h-full">
                  <img 
                    src={rightWallImage.url} 
                    alt="Right Wall Generation"
                    className="w-full h-full object-cover rounded-l-lg shadow-2xl"
                    style={{ 
                      filter: 'brightness(0.9) contrast(1.1)',
                      boxShadow: '-20px 0 40px rgba(0,0,0,0.5)'
                    }}
                  />
                  {/* Right Wall Frame Effect */}
                  <div className="absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-black/20 rounded-l-lg"></div>
                  
                  {/* Wall Info Overlay */}
                  {!isFullscreen && (
                    <div className="absolute bottom-6 right-6 bg-black/70 backdrop-blur-sm rounded-lg p-3 max-w-xs">
                      <h4 className="text-sm font-semibold text-teal-300 mb-1">Right Wall</h4>
                      <p className="text-xs text-gray-300">{rightWallImage.style}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-full bg-gradient-to-bl from-teal-900 to-teal-700 flex items-center justify-center rounded-l-lg shadow-2xl">
                  {isGenerating ? (
                    <div className="text-center">
                      <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-white">Generating Right Wall...</p>
                    </div>
                  ) : (
                    <div className="text-center text-teal-200">
                      <Monitor className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p>Right Wall Ready</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Corner Edge Effect */}
            <div 
              className="absolute top-0 bottom-0 left-1/2 w-1 transform -translate-x-1/2 z-10"
              style={{
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), rgba(0,0,0,0.4), rgba(0,0,0,0.8))',
                boxShadow: '0 0 20px rgba(0,0,0,0.5)'
              }}
            />

            {/* Room Floor Reflection Effect */}
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/30 to-transparent pointer-events-none"></div>

            {/* Ambient Room Lighting */}
            {leftWallImage && rightWallImage && (
              <div className="absolute inset-0 pointer-events-none">
                {/* Left wall ambient light */}
                <div 
                  className="absolute top-0 bottom-0 left-0 w-1/3 opacity-20"
                  style={{
                    background: `radial-gradient(ellipse at right center, ${
                      leftWallImage.side === 'left' && cycleHistory.length > 0 ? 
                        cycleHistory[cycleHistory.length - 1].movie?.sentiment === 'euphoric' ? '#fbbf24' :
                        cycleHistory[cycleHistory.length - 1].movie?.sentiment === 'melancholic' ? '#60a5fa' :
                        cycleHistory[cycleHistory.length - 1].movie?.sentiment === 'dark' ? '#ef4444' :
                        '#a855f7' : '#a855f7'
                    }, transparent)`
                  }}
                />
                {/* Right wall ambient light */}
                <div 
                  className="absolute top-0 bottom-0 right-0 w-1/3 opacity-20"
                  style={{
                    background: `radial-gradient(ellipse at left center, ${
                      rightWallImage.side === 'right' && cycleHistory.length > 0 ? 
                        cycleHistory[cycleHistory.length - 1].movie?.sentiment === 'euphoric' ? '#fb923c' :
                        cycleHistory[cycleHistory.length - 1].movie?.sentiment === 'melancholic' ? '#14b8a6' :
                        cycleHistory[cycleHistory.length - 1].movie?.sentiment === 'dark' ? '#6b21a8' :
                        '#10b981' : '#10b981'
                    }, transparent)`
                  }}
                />
              </div>
            )}

            {/* Generation Status Indicator */}
            {isGenerating && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 backdrop-blur-sm rounded-xl p-6 border border-purple-500/30 z-20">
                <div className="text-center">
                  <div className="w-16 h-16 border-4 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <h3 className="text-xl font-semibold text-purple-300 mb-2">Generating Connected Walls</h3>
                  <p className="text-gray-400">Creating cinematic interpretations...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Poetry Interaction Panel */}
      {!isFullscreen && (
        <div className="fixed bottom-4 left-4 right-4 bg-black/90 backdrop-blur-sm rounded-xl border border-purple-500/30">
          <div className="p-6">
            
            {/* Generated Poem Display */}
            {generatedPoem && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="w-5 h-5 text-purple-400" />
                  <h3 className="text-lg font-semibold text-purple-300">Generated Poem from Keywords</h3>
                </div>
                <div className="bg-gray-800 rounded-lg p-4 mb-4">
                  <pre className="text-gray-200 whitespace-pre-wrap font-mono text-sm leading-relaxed">
{generatedPoem}
                  </pre>
                </div>
                
                {/* Show ComfyUI Prompts Info */}
                {cycleHistory.length > 0 && cycleHistory[cycleHistory.length - 1].promptData && (
                  <div className="grid md:grid-cols-2 gap-4 mb-4">
                    <div className="bg-purple-900/30 rounded-lg p-3 border border-purple-500/20">
                      <h4 className="text-sm font-semibold text-purple-300 mb-2">
                        Left Wall: {cycleHistory[cycleHistory.length - 1].promptData.leftWall.style}
                      </h4>
                      <p className="text-xs text-gray-400">
                        {cycleHistory[cycleHistory.length - 1].promptData.leftWall.focus}
                      </p>
                    </div>
                    <div className="bg-teal-900/30 rounded-lg p-3 border border-teal-500/20">
                      <h4 className="text-sm font-semibold text-teal-300 mb-2">
                        Right Wall: {cycleHistory[cycleHistory.length - 1].promptData.rightWall.style}
                      </h4>
                      <p className="text-xs text-gray-400">
                        {cycleHistory[cycleHistory.length - 1].promptData.rightWall.focus}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Audience Sentiment Input */}
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Heart className="w-4 h-4 text-pink-400" />
                  <label className="text-sm font-medium text-gray-300">
                    Add your sentimental sentence to transform the walls:
                  </label>
                </div>
                <textarea
                  value={audienceSentiment}
                  onChange={(e) => setAudienceSentiment(e.target.value)}
                  placeholder="Express your feelings about this poem... (e.g., 'this reminds me of summer rain on city streets')"
                  rows={2}
                  className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg focus:border-purple-400 outline-none resize-none text-gray-200"
                  disabled={isGenerating}
                />
              </div>
              <button
                onClick={addAudienceSentiment}
                disabled={!audienceSentiment.trim() || isGenerating}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Transform Walls
              </button>
            </div>
            
            {/* Cycle Status */}
            <div className="mt-4 text-center text-sm text-gray-400">
              {isGenerating ? 
                "Generating connected wall compositions..." : 
                `Cycle ${currentCycle} - Walls are connected and waiting for your sentiment`
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InteractivePoetryWalls;