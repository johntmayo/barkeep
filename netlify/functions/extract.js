exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const { image } = JSON.parse(event.body);
    
    if (!image) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No image provided' })
      };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not set');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }

    // Detect image format (assume jpeg by default, but could be png)
    const imageFormat = image.startsWith('/9j/') ? 'image/jpeg' : 'image/png';

    // Call Anthropic Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: imageFormat,
                  data: image
                }
              },
              {
                type: 'text',
                text: `Extract the cocktail recipe information from this image. Return a JSON object with the following structure:
{
  "name": "Cocktail name",
  "category": "Cocktail category (e.g., Cocktail, Sour, Spirit Forward, Highball, Tiki, Spritz, Martini, Flip, Hot Drink, Other)",
  "glass": "Glass type (e.g., Rocks Glass, Coupe, Martini Glass, Highball Glass, Collins Glass, Champagne Flute)",
  "ingredients": [
    {
      "name": "Ingredient name",
      "measure": "Amount and unit (e.g., '2 oz', '1/2 oz', '1 dash')"
    }
  ],
  "instructions": "Step-by-step preparation instructions",
  "notes": "Any additional notes or garnish information (optional)"
}

Be precise with ingredient names and measurements. If any field cannot be determined, use an empty string. Return only valid JSON, no markdown formatting.`
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      return {
        statusCode: response.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to extract recipe from image' })
      };
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;
    
    if (!content) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No content returned from API' })
      };
    }

    // Parse the JSON response (handle markdown code blocks if present)
    let recipeData;
    try {
      // Remove markdown code blocks if present
      const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      recipeData = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Content:', content);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to parse recipe data' })
      };
    }

    // Ensure ingredients array exists and has the correct structure
    if (recipeData.ingredients && Array.isArray(recipeData.ingredients)) {
      recipeData.ingredients = recipeData.ingredients.map(ing => {
        // Handle both { name, measure } and { name, amount, unit } formats
        if (typeof ing === 'string') {
          return { name: ing, measure: '' };
        }
        if (!ing.measure && ing.amount) {
          ing.measure = ing.unit ? `${ing.amount} ${ing.unit}` : ing.amount;
        }
        return {
          name: ing.name || '',
          measure: ing.measure || ''
        };
      });
    } else {
      recipeData.ingredients = [];
    }

    // Ensure all required fields exist
    const result = {
      name: recipeData.name || '',
      category: recipeData.category || 'Cocktail',
      glass: recipeData.glass || '',
      ingredients: recipeData.ingredients || [],
      instructions: recipeData.instructions || '',
      notes: recipeData.notes || ''
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Internal server error' })
    };
  }
};

