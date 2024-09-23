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

 // Javascript BBCode Parser
 // @author Philip Nicolcev
 // @author Ferneu
 // @license MIT License


 function DetailsOnToggle(details)
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


var parserColors = [ 'gray', 'silver', 'white', 'yellow', 'orange', 'red', 'fuchsia', 'blue', 'green', 'black', '#cd38d9' ];

var parserTags = {
	'*': {
		openTag: function(params,content) {
			return '<li>';
		},
		closeTag: function(params,content) {
			return '</li>';
		}
	},
	'b': {
		openTag: function(params,content) {
			return '<b>';
		},
		closeTag: function(params,content) {
			return '</b>';
		}
	},
	'code': {
		openTag: function(params,content) {
			return '<code>';
		},
		closeTag: function(params,content) {
			return '</code>';
		},
		noParse: true
	},
	'color': {
		openTag: function(params,content) {
			var colorCode = params ? params : "inherit";
			BBCodeParser.regExpAllowedColors.lastIndex = 0;
			BBCodeParser.regExpValidHexColors.lastIndex = 0;
			if ( !BBCodeParser.regExpAllowedColors.test( colorCode ) ) {
				if ( !BBCodeParser.regExpValidHexColors.test( colorCode ) ) {
					colorCode = "inherit";
				} else {
					if (colorCode.substr(0,1) !== "#") {
						colorCode = "#" + colorCode;
					}
				}
			}

			return '<span style="color:' + colorCode + '">';
		},
		closeTag: function(params,content) {
			return '</span>';
		}
	},
	'd': {
		openTag: function(params,content) {						
			const s = params ? 
				('<summary>' + params + '</summary>') :
				'';
			return '<details ontoggle="DetailsOnToggle(this)">' + s;
		},
		closeTag: function(params,content) {
			return '</details>';
		}
	},
	'i': {
		openTag: function(params,content) {
			return '<i>';
		},
		closeTag: function(params,content) {
			return '</i>';
		}
	},
	'img': {
		openTag: function(params,content) {

			var myUrl = content;

			BBCodeParser.urlPattern.lastIndex = 0;
			if ( !BBCodeParser.urlPattern.test( myUrl ) ) {
				myUrl = "";
			}

			return '<img class="bbImage" height="180" data-src="' + myUrl + '">';
		},
		closeTag: function(params,content) {
			return '';
		},
		content: function(params,content) {
			return '';
		}
	},
	'list': {
		openTag: function(params,content) {
			return '<ul>';
		},
		closeTag: function(params,content) {
			return '</ul>';
		},
		restrictChildrenTo: ["*", "li"]
	},
	'noparse': {
		openTag: function(params,content) {
			return '';
		},
		closeTag: function(params,content) {
			return '';
		},
		noParse: true
	},
	'quote': {
		openTag: function(params,content) {						
			const s = params ? params : 'quote';
			return '<details open><summary>' + s + '</summary>';
		},
		closeTag: function(params,content) {
			return '</details>';
		}
	},
	's': {
		openTag: function(params,content) {
			return '<s>';
		},
		closeTag: function(params,content) {
			return '</s>';
		}
	},
	'size': {
		openTag: function(params,content) {
			var mySize = parseInt(params.substr(1),10) || 0;
			if (mySize < 10 || mySize > 20) {
				mySize = 'inherit';
			} else {
				mySize = mySize + 'px';
			}
			return '<span style="font-size:' + mySize + '">';
		},
		closeTag: function(params,content) {
			return '</span>';
		}
	},
	'spoiler': {
		openTag: function(params,content) {						
			const s = params ? params : 'spoiler';
			return '<details ontoggle="DetailsOnToggle(this)><summary>' + s + '</summary>';
		},
		closeTag: function(params,content) {
			return '</details>';
		}
	},
	'summary': {
		openTag: function(params,content) {
			return '<summary>';
		},
		closeTag: function(params,content) {
			return '</summary>';
		}
	},
	'u': {
		openTag: function(params,content) {
			return '<span style="text-decoration:underline">';
		},
		closeTag: function(params,content) {
			return '</span>';
		}
	},
	'url': {
		openTag: function(params,content) {		
			var myUrl;

			if (!params) {
				myUrl = content.replace(/<.*?>/g,"");
			} else {
				//myUrl = params.substr(1);
			}

			BBCodeParser.urlPattern.lastIndex = 0;
			if ( !BBCodeParser.urlPattern.test( myUrl ) ) {
				myUrl = "#";
			}

			return '<a href="' + myUrl + '">';
		},
		closeTag: function(params,content) {
			return '</a>';
		}
	},
	'video': {
		openTag: function(params,content) {

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
				urlsJson = urlsJson.substr(0, urlsJson.length-1);
			}

			urlsJson += ']';		

			return '<video \
controls \
class="bbVideo" \
preload="none" \
data-urls=\'' + urlsJson + '\'>';
		},
		closeTag: function(params,content) {
			return '</video>';
		},
		content: function(params,content) {
			return '';
		}
	},
};

 		 

var BBCodeParser = (function(parserTags, parserColors) {
	'use strict';
	
	var me = {},
		urlPattern = /^(?:https?|file|c):(?:\/{1,3}|\\{1})[-a-zA-Z0-9:;@#%&()~_?\+=\/\\\.]*$/,
		emailPattern = /[^\s@]+@[^\s@]+\.[^\s@]+/,
		fontFacePattern = /^([a-z][a-z0-9_]+|"[a-z][a-z0-9_\s]+")$/i,
		tagNames = [],
		tagNamesNoParse = [],
		regExpAllowedColors,
		regExpValidHexColors = /^#?[a-fA-F0-9]{6}$/,
		ii, tagName, len;
		
	// create tag list and lookup fields
	for (tagName in parserTags) {
		if (!parserTags.hasOwnProperty(tagName))
			continue;
		
		if (tagName === '*') {
			tagNames.push('\\' + tagName);
		} else {
			tagNames.push(tagName);
			if ( parserTags[tagName].noParse ) {
				tagNamesNoParse.push(tagName);
			}
		}

		parserTags[tagName].validChildLookup = {};
		parserTags[tagName].validParentLookup = {};
		parserTags[tagName].restrictParentsTo = parserTags[tagName].restrictParentsTo || [];
		parserTags[tagName].restrictChildrenTo = parserTags[tagName].restrictChildrenTo || [];

		len = parserTags[tagName].restrictChildrenTo.length;
		for (ii = 0; ii < len; ii++) {
			parserTags[tagName].validChildLookup[ parserTags[tagName].restrictChildrenTo[ii] ] = true;
		}
		len = parserTags[tagName].restrictParentsTo.length;
		for (ii = 0; ii < len; ii++) {
			parserTags[tagName].validParentLookup[ parserTags[tagName].restrictParentsTo[ii] ] = true;
		}
	}
	
	regExpAllowedColors = new RegExp('^(?:' + parserColors.join('|') + ')$');
	
	/* 
	 * Create a regular expression that captures the innermost instance of a tag in an array of tags
	 * The returned RegExp captures the following in order:
	 * 1) the tag from the array that was matched
	 * 2) all (optional) parameters included in the opening tag
	 * 3) the contents surrounded by the tag
	 * 
	 * @param {type} tagsArray - the array of tags to capture
	 * @returns {RegExp}
	 */
	function createInnermostTagRegExp(tagsArray) {
		var openingTag = '\\[(' + tagsArray.join('|') + ')\\b(?:[ =]([\\w"#\\-\\:\\/= ]*?))?\\]',
			notContainingOpeningTag = '((?:(?=([^\\[]+))\\4|\\[(?!\\1\\b(?:[ =](?:[\\w"#\\-\\:\\/= ]*?))?\\]))*?)',
			closingTag = '\\[\\/\\1\\]';
			
		return new RegExp( openingTag + notContainingOpeningTag + closingTag, 'i');
	}
	
	/*
	 * Escape the contents of a tag and mark the tag with a null unicode character.
	 * To be used in a loop with a regular expression that captures tags.
	 * Marking the tag prevents it from being matched again.
	 * 
	 * @param {type} matchStr - the full match, including the opening and closing tags
	 * @param {type} tagName - the tag that was matched
	 * @param {type} tagParams - parameters passed to the tag
	 * @param {type} tagContents - everything between the opening and closing tags
	 * @returns {String} - the full match with the tag contents escaped and the tag marked with \u0000
	 */
	function escapeInnerTags(matchStr, tagName, tagParams, tagContents) {
		tagParams = tagParams || "";
		tagContents = tagContents || "";
		tagContents = tagContents.replace(/\[/g, "&#91;").replace(/\]/g, "&#93;");
		return "[\u0000" + tagName + tagParams + "]" + tagContents + "[/\u0000" + tagName + "]";
	}
	
	/* 
	 * Escape all BBCodes that are inside the given tags.
	 * 
	 * @param {string} text - the text to search through
	 * @param {string[]} tags - the tags to search for
	 * @returns {string} - the full text with the required code escaped
	 */
	function escapeBBCodesInsideTags(text, tags) {
		var innerMostRegExp;
		if (tags.length === 0 || text.length < 7)
			return text;
		innerMostRegExp = createInnermostTagRegExp(tags);
		while (
			text !== (text = text.replace(innerMostRegExp, escapeInnerTags))
		);
		return text.replace(/\u0000/g,'');
	}
	
	/*
	 * Process a tag and its contents according to the rules provided in parserTags.
	 * 
	 * @param {type} matchStr - the full match, including the opening and closing tags
	 * @param {type} tagName - the tag that was matched
	 * @param {type} tagParams - parameters passed to the tag
	 * @param {type} tagContents - everything between the opening and closing tags
	 * @returns {string} - the fully processed tag and its contents
	 */
	function replaceTagsAndContent(matchStr, tagName, tagParams, tagContents) {
		tagName = tagName.toLowerCase();
		tagParams = tagParams || "";
		tagContents = tagContents || "";
		return parserTags[tagName].openTag(tagParams, tagContents) + (parserTags[tagName].content ? parserTags[tagName].content(tagParams, tagContents) : tagContents) + parserTags[tagName].closeTag(tagParams, tagContents);
	}
	
	function processTags(text, tagNames) {
		var innerMostRegExp;
		
		if (tagNames.length === 0 || text.length < 7)
			return text;
		
		innerMostRegExp = createInnermostTagRegExp(tagNames);
		
		while (
			text !== (text = text.replace(innerMostRegExp, replaceTagsAndContent))
		);
		
		return text;
	}
	
	/*
	 * Public Methods and Properties
	 */
	me.process = function(text, config) {
		text = escapeBBCodesInsideTags(text, tagNamesNoParse);
		
		return processTags(text, tagNames);
	};
	
	me.allowedTags = tagNames;
	me.urlPattern = urlPattern;
	me.emailPattern = emailPattern;
	me.regExpAllowedColors = regExpAllowedColors;
	me.regExpValidHexColors = regExpValidHexColors;
		
	return me;
})(parserTags, parserColors);

		


// MMA-T specific stuff
//
// parse bbcodes in tags containing the "comment" class when the page is loaded
window.addEventListener("DOMContentLoaded", function(event) 
{
	var comments = document.querySelectorAll('.comment');

	for(var comment of comments)
	{
	  	comment.innerHTML = BBCodeParser.process( comment.innerHTML );

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
		// browsers doing stupid things (look at you Firefox). When the 
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


