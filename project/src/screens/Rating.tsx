import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Star, Send, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { BadgeIcon } from '@/components/ui';
import type { Profile } from '@/lib/types';

const TAGS = ['Punctual', 'Friendly', 'Felt safe', 'Good communicator', 'Reliable', 'Would walk again'];

export function RatingScreen() {
  const { id: journeyId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [companion, setCompanion] = useState<Profile | null>(null);
  const [stars, setStars] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(false);

  useEffect(() => {
    if (!journeyId || !profile) return;
    (async () => {
      // Find companion
      const { data: parts } = await supabase
        .from('journey_participants')
        .select('user_id')
        .eq('journey_id', journeyId)
        .neq('user_id', profile.id);
      if (parts && parts.length > 0) {
        const { data: cp } = await supabase.from('profiles').select('*').eq('id', parts[0].user_id).maybeSingle();
        setCompanion(cp as Profile | null);
      }

      // Check if already rated
      const { data: existing } = await supabase
        .from('ratings')
        .select('id')
        .eq('journey_id', journeyId)
        .eq('rater_id', profile.id)
        .maybeSingle();
      if (existing) setAlreadyRated(true);
    })();
  }, [journeyId, profile]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handleSubmit = async () => {
    if (!profile || !companion || !journeyId || stars === 0) return;
    await supabase.from('ratings').insert({
      journey_id: journeyId,
      rater_id: profile.id,
      ratee_id: companion.id,
      stars,
      tags: selectedTags,
      comment: comment || null,
    });

    // Update companion's average rating
    const { data: allRatings } = await supabase
      .from('ratings')
      .select('stars')
      .eq('ratee_id', companion.id);
    if (allRatings && allRatings.length > 0) {
      const avg = allRatings.reduce((sum, r) => sum + r.stars, 0) / allRatings.length;
      await supabase.from('profiles').update({ avg_rating: Math.round(avg * 100) / 100 }).eq('id', companion.id);
    }

    setSubmitted(true);
  };

  if (alreadyRated) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="w-16 h-16 bg-success-100 dark:bg-success-700/30 rounded-full flex items-center justify-center">
          <Check size={28} className="text-success-600" />
        </div>
        <p className="font-semibold text-gray-900 dark:text-white">Already rated</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">You've already rated this journey.</p>
        <button onClick={() => navigate('/app/home')} className="btn-primary mt-4">Go Home</button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center animate-scale-in">
        <div className="w-16 h-16 bg-success-100 dark:bg-success-700/30 rounded-full flex items-center justify-center">
          <Check size={28} className="text-success-600" />
        </div>
        <p className="font-semibold text-gray-900 dark:text-white">Thank you!</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">Your rating has been submitted.</p>
        <button onClick={() => navigate('/app/home')} className="btn-primary mt-4">Go Home</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">Rate Your Companion</h1>

      {companion && (
        <div className="card flex items-center gap-3">
          <div className="w-14 h-14 bg-gradient-to-br from-brand-400 to-brand-600 rounded-full flex items-center justify-center text-white text-xl font-bold">
            {companion.full_name[0]}
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">{companion.full_name.split(' ')[0]}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{companion.department} {companion.year}</p>
            <BadgeIcon badge={companion.badge} />
          </div>
        </div>
      )}

      {/* Stars */}
      <div className="card text-center">
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">How was your walk?</p>
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => setStars(n)}
              className={`transition-transform active:scale-90 ${n <= stars ? 'text-amber-400' : 'text-gray-300 dark:text-gray-600'}`}
            >
              <Star size={36} fill={n <= stars ? 'currentColor' : 'none'} />
            </button>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div className="card">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">What stood out? (optional)</p>
        <div className="flex flex-wrap gap-2">
          {TAGS.map(tag => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                selectedTags.includes(tag)
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Comment */}
      <div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="input"
          rows={3}
          placeholder="Additional comments (optional)"
        />
      </div>

      <button onClick={handleSubmit} disabled={stars === 0} className="btn-primary w-full">
        <Send size={20} /> Submit Rating
      </button>

      <p className="text-xs text-gray-400 text-center">Ratings are permanent and cannot be edited</p>
    </div>
  );
}
