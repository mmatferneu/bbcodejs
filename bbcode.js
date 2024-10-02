'use strict'

// I hearby grant permission for this kick-ass script to be used on the site 
// you are seeing it in action and only there. If you want to use it anywhere
// else you are required to ask me (Ferneu.) Don't be afraid, it'il probably be
// way cheaper than you think.



// this is awesome video player allows a video element to have a playlist. It 
// will then start playing the next video as soon as the current video ends.
//
//
// Since Ferneu is awesome, this player creates a kind of double buffer (by 
// using a hidden secondary video element) in order to make the 'gap' between 
// the end of a video and the start of the next one as imperceptible as 
// possible. Great for cases where you are playing a video that has been split
// (probably due to hosting limitations)
//
// Unfortunatelly, currently there is no event that gets fired when the browser 
// has finishing downloading the whole video. That would be very usefull to know
// when we can start preloading the next video. We have two choices: 
// 'canplaythrough' and 'timeupdate'
//
// Unfortunately 'canplaythrough' is not exactly ideal, since what it actually 
// tell us is that the video will not stall if the data continues to be 
// downloaded at the current speed. While this should work most of the time in 
// this world of high-speed internet connections, it is not 100% safe. If the 
// speed lowers for whatever reason, including a stupid js code requesting the 
// next video from the playlist (hehe), the current video might stall. 
// 
// What is left is the 'timeupdate' event, which is fired a couple of times per 
// second. Kind of an overkill, but it will allow us to check the current state
// of the video element buffer and only start downloading the next video when we
// know for sure we've finished downloading the current one. Unfortunately this
// is also not perfect. There is no way to work with byte counts, so we have the
// video duration. We know the total video duration and the duration we have
// buffered. But those are in fractions of seconds and, usually, they won't 
// match even after everything is fully buffered. Because of that I decided to 
// simply use a safe margin - I start loading the next video whenever there are 
// less than 10 seconds remaining to be  downloaded.
// 	
// Apparently there is also a 'progress' event should get fired from time to 
// time when data is loaded. But, according to my tests, it won't get fired one
// last time when the final bytes are loaded, so we cannot safely rely on it. If
// the last time it is fired is not enough the reach the threshold where we 
// would start loading the next video, the backbuffer will serve for nothing.
//
// One final caveat - this awesome backbuffer technique cannot be used when the 
// video is playing fullscreen. Because that would require us to be able to 
// change the element current being displayed in fullscreen mode and, due to 
// safety reasons, browsers only allow that to happen when there is some sort of
// user interaction. The good thing is that, since we've started loading the 
// next video, even if the backbuffer element is not going to be shown, that 
// data was already downloaded and the browser seems to cache and use it. I 
// think. Could be that my connection and servers I'm using to test are just 
// too fast for me to notice anything.
class VideoPlayer 
{
	static Initialize(videoElement, urls, loop)
	{				
		var divContainer = VideoPlayer.#CreateElement(
			'div',
			'bbVideo_container');
		
		var divControls = VideoPlayer.#CreateElement(
			'div',
			'bbVideo_controls');

		var buttonPrevious = VideoPlayer.#CreateElement(
			'button',
			'bbVideo_controls_button',
			'◄');
			
		var buttonNext = VideoPlayer.#CreateElement(
			'button',
			'bbVideo_controls_button',
			'►');

		var spanStatus = VideoPlayer.#CreateElement(
			'span',
			'bbVideo_controls_status');

		var videoBackbuffer = videoElement.cloneNode(true);
		VideoPlayer.#Hide(videoBackbuffer);

		videoElement.replaceWith(divContainer);

		divContainer.appendChild(videoElement);
		divContainer.appendChild(videoBackbuffer);
		divContainer.appendChild(divControls);
		divControls.appendChild(buttonPrevious);
		divControls.appendChild(buttonNext);
		divControls.appendChild(spanStatus);
	
		videoElement.VideoPlayer = {
			Urls: urls,
			Index: 0,
			Loop: false,
			StatusElement: spanStatus,
			VideoElement: videoElement,
			Backbuffer: videoBackbuffer,
			BackbufferPrepared: false					
		};

		videoBackbuffer.VideoPlayer = videoElement.VideoPlayer;

		if(urls.length > 0)
		{
			videoElement.src = urls[0];

			if(urls.length > 1)
			{
				VideoPlayer.#UpdateStatus(videoElement.VideoPlayer);
			}
			
		}

		if(urls.length <= 1)
		{
			VideoPlayer.#Hide(divControls);
		}

		// when the video player is first created we need to ensure it
		// is listening to a couple of events. When the videoElement and
		// the backbuffer are flipped (because a video ended and we are
		// going to play the next one), we remove these event handlers
		// and add them to the backbuffer (which is about to become the
		// visible video element)
		VideoPlayer.#AddVideoEventListeners(videoElement);

		buttonPrevious.addEventListener(
			'click', 
			function(){
				VideoPlayer.#OnClickPrevious(videoElement.VideoPlayer);
			});

		buttonNext.addEventListener(
			'click', 
			function(){
				VideoPlayer.#OnClickNext(videoElement.VideoPlayer);
			});
	}

	static #CreateElement(tagName, className, text = null)
	{
		var e = document.createElement(tagName);

		e.className = className;

		if(text)
		{
			const content = document.createTextNode(text);
			e.appendChild(content);
		}

		return e;
	}
				

	static #UpdateStatus(vp)
	{
		vp.StatusElement.innerHTML = (vp.Index + 1)
			+ " of " 
			+ vp.Urls.length
			// + ' ' + vp.Urls[vp.Index].substring(vp.Urls[vp.Index].length-8)
			;					
	}

	static #Hide(element)
	{
		element.style.display = 'none';
	}

	static #Show(element)
	{
		element.style.display = 'block';
	}

	static #AddVideoEventListeners(videoElement)
	{
		videoElement.addEventListener('ended', VideoPlayer.#OnEnded);				
		videoElement.addEventListener('timeupdate', VideoPlayer.#OnTimeUpdate);
	}

	static #RemoveVideoEventListeners(videoElement)
	{
		videoElement.removeEventListener('timeupdate', VideoPlayer.#OnTimeUpdate);
		videoElement.removeEventListener('ended', VideoPlayer.#OnEnded);
	}

	static #PrepareBackbuffer(vp)
	{				
		var nextIndex = vp.Index + 1;
		if(vp.Index >= vp.Urls.length   &&   vp.Loop)
		{
			nextIndex = 0;					
		}

		if(nextIndex < vp.Urls.length)
		{					
			// this will tell the browser to start loading the next video
			// (if it feels like it)
			vp.Backbuffer.src = vp.Urls[nextIndex];
			vp.Backbuffer.preload = 'auto';
		}
		
		// always set this flag, even when we run out of videos to play.
		// This flag will stop the 'OnTimeUpdated' event to waste cpu
		// doing nothing until the last video is done				
		vp.BackbufferPrepared = true;
	}

	static #ResetBackbuffer(vp)
	{
		VideoPlayer.#Pause(vp.Backbuffer);
		vp.Backbuffer.preload = 'none';
		vp.BackbufferPrepared = false;

		// if you simply set 'src' to an empty value you will receive
		// MEDIA_ELEMENT_ERROR because it will try to load that empty
		// value.
		vp.Backbuffer.removeAttribute('src');
	}

	static #Play(videoElement)
	{									
		// see the comments on VideoPlayer.#Pause for the reason why
		// we always add (and remove) the event listeners
		videoElement.currentTime = 0;
		VideoPlayer.#AddVideoEventListeners(videoElement);

		//VideoPlayer.#Show(videoElement);
		
		videoElement.play();
	}

	static #Pause(videoElement)
	{
		// the reason we always remove the event handlers on pause is 
		// to avoid receive those events when the video element becomes
		// a backbuffer. Since those are used to trigger the loading
		// of the next video into the backbuffer, if they are fired for
		// the backbuffer, bananas will happen.
		videoElement.pause();
		VideoPlayer.#RemoveVideoEventListeners(videoElement);
						
	}

	static #PlayVideo(vp, newIndex)
	{										
		const urlCount = vp.Urls.length;

		if(urlCount === 1)
		{
			return;
		}
		
		if(newIndex >= urlCount)
		{
			if(vp.Loop)
			{
				newIndex = 0;
			}
			else
			{
				return;
			}
		}

		const url = vp.Urls[newIndex];

		if(vp.Backbuffer.src === url)
		{	
			// true if the video was playing in fullscreen mode
			const wasFullscreen = document.fullscreenElement === vp.VideoElement;

			if(!wasFullscreen)
			{							
				VideoPlayer.#Hide(vp.VideoElement);
			    VideoPlayer.#Show(vp.Backbuffer);
																
				const tmp = vp.Backbuffer;
				vp.Backbuffer = vp.VideoElement;
				vp.VideoElement = tmp;						
			}
			else
			{
				// we cannot force an element into fullscren mode 
				// without user interation (browser safety feature). 
				// That means we cannot "flip" the backuffer and show it
				// and will have to reuse the same video element. Which
				// might cause some flickering
				vp.VideoElement.src = url;
			}
		}
		else
		{	
			vp.VideoElement.src = url;
		}

		// do this out of the if above in order to ensure 
		// vp.BackbufferPrepared is set to false after playing the last
		// video of the playlist. This will ensure the buffering 
		// mechanism work normaly in case the user decides to play it
		// all again (or if vp.Loop is true)
		VideoPlayer.#ResetBackbuffer(vp);

		vp.Index = newIndex;
		VideoPlayer.#Play(vp.VideoElement);			
		VideoPlayer.#UpdateStatus(vp);									
	}

	static #OnClickPrevious(vp)
	{				
		if(vp.Index > 0)
		{				
			VideoPlayer.#PlayVideo(vp, 	vp.Index - 1);
		}
	}

	static #OnClickNext(vp)
	{				
		if(vp.Index < (vp.Urls.length-1))
		{
			VideoPlayer.#PlayVideo(vp, vp.Index + 1);
		}
	}

	static #OnEnded(event)
	{
		VideoPlayer.#PlayVideo(
			event.target.VideoPlayer, 
			event.target.VideoPlayer.Index + 1);
	}

	static #OnTimeUpdate(event)
	{						
		const video = event.target;
		if(!video.VideoPlayer.BackbufferPrepared)
		{
			const i = video.buffered.length - 1;
			if(i >= 0)
			{
				const timeBuffered = video.buffered.end(i);						

				const remaining = video.duration - timeBuffered;

				if(remaining < 10)
				{							
					VideoPlayer.#PrepareBackbuffer(video.VideoPlayer);
				}
			}
		}
	}
}


class BBCode
{
	static DetailsOnToggle(details)
	{
		// pre-load videos and images when the details tag is opened.
		// Unload them when it is closed
		if(details.open)
		{
			// get only videos that are direct children of this details tag.
			// ignororing the ones that might be inside inner details tag
			// because those should only be loaded when their parent tag
			// is opened/expanded
			var videoContainers = details.querySelectorAll(':scope > .bbVideo_container');

			for(var vc of videoContainers)
			{
				// the reason we go through all this trouble to reach the 
				// video element is because the video player may create a
				// hidden video element that works as a back buffer for
				// pre-loading the next video in case this one has a 
				// playlist. And we do not want that next video to start
				// pre-loading right away. The video player will trigger
				// that when the time is right
				var videoPlayer = vc.childNodes[0].VideoPlayer;			 		
				videoPlayer.VideoElement.setAttribute('preload', 'metadata');
			}

			// same for images. Only direct children
			var images = details.querySelectorAll(':scope > img');
			
			for(var image of images)
			{
				if(!image.src)
				{
					image.setAttribute('src', image.dataset.src);
				}
			}
		}
		else
		{
			var videos = details.querySelectorAll(':scope > .bbVideo_container');
			
			for(var video of videos)
			{
				// if you simply set 'src' to an empty string you will
				// receive an error because the element, apparently, will
				// try to load that empty string
				video.removeAttribute('src');
			}

			var images = details.querySelectorAll(':scope > img');
							
			for(var image of images)
			{
				image.dataset.src = image.src;
				image.removeAttribute('src');
			}
		}
	}

	static #MakeDetailsToHtmlObject(startOpened, defaultSummary)
	{
		return {
			HasContent: true,
			OpenTag: function(attributes) {		
				var summaryValue = attributes.length > 0 ?
					attributes[0].Value : 
					defaultSummary;

				const s = summaryValue ? 
					('<summary>' + summaryValue + '</summary>') :
					'';

				return '<details ' + 
					(startOpened ? 'open ' : '')  +
					'ontoggle="BBCode.DetailsOnToggle(this)">' + s;
			},
			CloseTag: function(content) {
				return content + '</details>';
			}
		};	
	}

	static #ToHtml = {
		//----------------------------------------------------------------------
		// begin bbcodes already handled by the php backend
		'b': {
			HasContent: true,
			OpenTag: function(attributes) {
				return '<b>';
			},
			CloseTag: function(content) {
				return content + '</b>';
			}
		},
		'color': {
			HasContent: true,
			OpenTag: function(attributes) {
				const color = attributes.length > 0 ? 
					attributes[0].Value :
					'inherit';
	
				return '<span style="color:' + color + '">';
			},
			CloseTag: function(content) {
				return content + '</span>';
			}
		},
		'img': {
			HasContent: true,
			OpenTag: function(attributes) {
				return '';
			},
			CloseTag: function(content) {
				if(content)
				{
					return '<img class="bbImage" data-src="' + content + '">';
				}
				return '';
			}
		},
		// end bbcodes already handled by the php backend
		//----------------------------------------------------------------------
		
		'd': BBCode.#MakeDetailsToHtmlObject(false),
		'img2': {
			HasContent: true,
			OpenTag: function(attributes) {
				return '';
			},
			CloseTag: function(content) {
				if(content)
				{
					return '<img class="bbImage" data-src="' + content + '">';
				}
				return '';
			}
		},
		'quote2': BBCode.#MakeDetailsToHtmlObject(true),
		'summary': {
			HasContent: true,
			OpenTag: function(attributes) {
				return '<summary>';
			},
			CloseTag: function(content) {
				return content + '</summary>';
			}
		},
		'spoiler': BBCode.#MakeDetailsToHtmlObject(false, 'spoiler'),
		'video': {
			HasContent: true,
			OpenTag: function(attributes)
			{
				return '';
			},
			CloseTag: function(content)
			{
				var urls = content.split('\n');

				var urlsJson = '[';
				for(var u of urls)
				{
					u = u.replace(/\s+/g, '');
					if(u.length > 0)
					{
						urlsJson += '"' + u + '",';
					}
				}

				if(urlsJson.length > 1)
				{
					urlsJson = urlsJson.substring(0, urlsJson.length-1);
				}

				urlsJson += ']';		

				return '<video \
controls \
class="bbVideo" \
preload="none" \
data-urls=\'' + urlsJson + '\'></video>';
			},
		}
	}

	static #State = {		
		Unknown: 0,
		Content: 1,
		TagOpen:2,
		TagName:3,
		TagAttributeOrAttributeEnd:4,
		TagAttribute:5,
		TagAttributesEnd:6,
		TagClose:7,

		Count:8
	}

	static #Tag = class
	{
		Name = '';
		Attributes = [];
		Content = '';
		
		constructor(name)
		{
			this.Name = name;
		}
		
		ToString()
		{
			var attrs = '';

			for(const a of this.Attributes)
			{
				attrs += ' ' + a.Name;

				if(a.Value)
				{
					attrs += '="' + a.Value + '"';
				}
			}

			var s = '[' + this.Name + attrs + ']';
			if( this.Content.length > 0 )
			{
				s += this.Content + '[/' + this.Name + ']';
			}

			return s;
		}
	}

	static #Stack = class
	{
		Push(item)
		{
			this.#_items.push(item);
		}

		Top()
		{
			return this.#_items[this.#_items.length-1];
		}

		Pop()
		{
			return this.#_items.pop();
		}

		Clear()
		{
			this.#_items.length = 0;
		}

		Empty()
		{
			return this.#_items.length === 0;
		}

		#_items = [];
	}
	
	static #Parser = class
	{
		#_data = '';
		#_p  = '';

		Initialize(text)
		{
			this.#_data = text;
			this.#_p = 0;
		}

		Peek()
		{
			return this.#_data[this.#_p];
		}

		Read()
		{
			const p = this.#_p;
			++this.#_p;
			return this.#_data[p];
		}

		Skip()
		{
			++this.#_p;
		}

		SkipSpaces()
		{
			var p = this.#_p;
			const size = this.#_data.length;
			for(; p<size; ++p)
			{
				// evil... but fast!
				if(this.#_data.charCodeAt(p) > 32)
				{
					break;
				}
			}

			this.#_p = p;

			return this.#_p < size;
		}		

		ReadUntilNotAlphaNum()
		{	
			var p = this.#_p;

			const start = p;

			const size = this.#_data.length;
			for(; p<size; ++p)
			{
				const c = this.#_data.charCodeAt(p);
				
				const isAlphaNum = 
					(c >= 96 && c <= 123) || // a-z					
					(c >= 64 && c <= 91)  || // A-Z
					(c >= 47 && c <= 58);    // 0-9
				
				if(!isAlphaNum)
				{
					break;
				}
			}

			this.#_p = p;

			return this.#_data.substring(start, p);
		}
		
		ReadQuotedText()
		{
			this.Skip();

			var p = this.#_p;

			const start = p;
			const size = this.#_data.length;
			var escaped = false;
			for(; p<size; ++p)
			{
				if(!escaped)
				{
					const c = this.#_data[p];
					
					if(c === '"')
					{
						break;						
					}
					else if(c === '\\')
					{
						escaped = true;
					}
				}
				else
				{
					escaped = false;
				}
			}

			this.#_p = p + 1;

			return this.#_data.substring(start, p);
		}		

		ReadUntil(delimiter)
		{
			const start = this.#_p;
			
			var p = this.#_data.indexOf(delimiter, start);
			if(p < 0)
			{
				p = this.#_data.length;
			}

			this.#_p = p;

			return this.#_data.substring(start, p);
		}

		Empty()
		{
			return this.#_p >= this.#_data.length;
		}
	}

	#_parser = new BBCode.#Parser();
	#_html = '';
	#_tagStack = new BBCode.#Stack();
	#_state = BBCode.#State.Unknown;

	#AppendHtml(html)
	{
		if(html)
		{
			if(!this.#_tagStack.Empty())
			{
				this.#_tagStack.Top().Content += html;
			}
			else
			{
				this.#_html += html;
			}
		}
	}

	#OnUnknown()
	{
		if(this.#_parser.Peek() === '[')
		{
			this.#_state = BBCode.#State.TagOpen;
		}
		else
		{
			this.#_state = BBCode.#State.Content;
		}

		return true;
	}

	#OnTagOpen()
	{
		this.#_parser.Skip();
		const c = this.#_parser.Peek();
		if(c >= 'a' && c <= 'z')			
		{
			this.#_state = BBCode.#State.TagName;
		}
		else if(c == '/')
		{
			this.#_state = BBCode.#State.TagClose;
		}
		else
		{
			return false;
		}

		return true;
	}

	#OnTagName()
	{
		const name = this.#_parser.ReadUntilNotAlphaNum();
		this.#_tagStack.Push( new BBCode.#Tag(name) );

		this.#_state = BBCode.#State.TagAttributeOrAttributeEnd;
		
		return true;
	}

	#OnTagAttributeOrAttributeEnd()
	{
		this.#_parser.SkipSpaces();
		if(this.#_parser.Peek() === ']')
		{
			this.#_state = BBCode.#State.TagAttributesEnd;
		}
		else
		{
			this.#_state = BBCode.#State.TagAttribute;
		}

		return true;
	}

	#OnTagAttribute()
	{
		const name = this.#_parser.ReadUntilNotAlphaNum();		
		var value = null;
		if(this.#_parser.Peek() === '=')
		{
			this.#_parser.Skip();
			if(this.#_parser.Peek() === '"')
			{
				value = this.#_parser.ReadQuotedText();
			}
			else
			{
				value = this.#_parser.ReadUntilNotAlphaNum();
			}			
		}

		if(name || value)
		{
			this.#_tagStack.Top().Attributes.push( 
				{
					Name: name,
					Value: value
				} );

			this.#_state = BBCode.#State.TagAttributeOrAttributeEnd;

			return true;
		}

		// the user probably forgot to put the attribute value inside quotes
		return false;
	}

	#OnTagAttributesEnd()
	{
		const tag = this.#_tagStack.Top();
		
		const toHtml = BBCode.#ToHtml[ tag.Name ];

		var hasContent = false;

		if(toHtml)
		{ 			
			this.#AppendHtml( toHtml.OpenTag(tag.Attributes) );
			hasContent = toHtml.HasContent;
		}
		else
		{
			this.#AppendHtml( tag.ToString() );
		}
		
		this.#_parser.Skip();

		if(!hasContent)
		{
			this.#_tagStack.Pop();
		}

		this.#_state = BBCode.#State.Unknown;

		return true;
	}

	#OnContent()
	{ 
		const value = this.#_parser.ReadUntil('[');
		
		this.#AppendHtml(value);

		this.#_state = BBCode.#State.Unknown;

		return true;
	}

	#OnTagClose()
	{
		this.#_parser.Skip();
		const name = this.#_parser.ReadUntilNotAlphaNum();
		
		if(this.#_parser.Read() !== ']' ||  this.#_tagStack.Empty())
		{
			return false;
		}
		
		const tag = this.#_tagStack.Pop();
		if(tag.Name !== name)
		{
			return false;
		}

		const toHtml = BBCode.#ToHtml[ tag.Name ];
		var html;
		if(toHtml)
		{
			html = toHtml.CloseTag(tag.Content);
		}
		else
		{
			html = '[/' + name + ']';
		}

		if(!this.#_tagStack.Empty())
		{
			this.#_tagStack.Top().Content += html;
		}
		else
		{
			this.#_html += html;
		}

		this.#_state = BBCode.#State.Unknown;

		return true;
	}

	Parse(html)
	{
		this.#_parser.Initialize(html);
		this.#_html = '';
		this.#_tagStack.Clear();
		this.#_state = BBCode.#State.Unknown;
			
		for(var ok=true; 
			ok === true   &&   this.#_parser.Empty() == false; )
		{
			switch(this.#_state)
			{
				case BBCode.#State.Unknown:
					ok = this.#OnUnknown();
					break;
				case BBCode.#State.Content:
					ok = this.#OnContent();
					break;
				case BBCode.#State.TagOpen:
					ok = this.#OnTagOpen();
					break;
				case BBCode.#State.TagName:
					ok = this.#OnTagName();
					break;
				case BBCode.#State.TagAttributeOrAttributeEnd:
					ok = this.#OnTagAttributeOrAttributeEnd();
					break;
				case BBCode.#State.TagAttribute:
					ok = this.#OnTagAttribute();
					break;
				case BBCode.#State.TagAttributesEnd:
					ok = this.#OnTagAttributesEnd();
					break;
				case BBCode.#State.TagClose:
					ok = this.#OnTagClose();
					break;
			}
		}

		return this.#_html;
	}
}


// MMA-T specific stuff
//
// parse bbcodes in tags containing the "comment" class when the page is loaded
window.addEventListener("DOMContentLoaded", function(event) 
{
	var bbcode = new BBCode();

	var comments = document.querySelectorAll('.comment');

	for(var comment of comments)
	{	  	
		var html = comment.innerHTML;

		// MMA-T php scripts will try to replace urls inside [video] tags by
		// links. This should not be necessary once (and if) the scripts are 
		// updated to understand video tags. It will also insert <br /> tags
		// on the line breaks. We remove them too
		html = html.replace(/([video][^<])*<br *\/*>([^\[]*\[\/video])/gm, '$1$2');
		html = html.replace(/<a [^\[]*\[\/video]">([^<]*)<\/a>/g, '$1');

		comment.innerHTML = bbcode.Parse( html );


		// initialize videos generated by bbcode
	  	var videos = comment.querySelectorAll('.bbVideo');
	  	
	 	for(var video of videos)
	 	{
	 		VideoPlayer.Initialize(
				video, 
				JSON.parse(video.dataset.urls), 
				false);		 	
	 	}

		// videos, by default, use preload=none in order to avoid stupid
		// browsers doing stupid things (I'm looking at you Firefox). When the 
		// is inside a <details> tag, we change preload to 'metadata' when
		// the tag is opened.
		// 
		// What is left are videos outside detail tags. Those we can leave
		// the preload to metadata because we assume there will only be
		// a few of them in a page
	 	var videosNotInsideDetails = comment.querySelectorAll('.bbVideo:not(details .bbVideo)');
	 	for(var video of videosNotInsideDetails)
	 	{
	 		video.setAttribute('preload', 'metadata');
	 	}

	 	// same for images. When the bbcode is parsed, the src is left empty
	 	// and only when the detail tag is opened we set src to the desired
	 	// attribute
	 	var imagesNotInsideDetails = comment.querySelectorAll('.bbImage:not(details .bbImage)');
	 	for(var image of imagesNotInsideDetails)
	 	{
	 		image.setAttribute('src', image.dataset.src);
	 	}		
 	}
});

