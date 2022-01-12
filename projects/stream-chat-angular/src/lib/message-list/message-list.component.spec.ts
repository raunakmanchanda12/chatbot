import { SimpleChange } from '@angular/core';
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { Channel } from 'stream-chat';
import { ChannelService } from '../channel.service';
import { ChatClientService } from '../chat-client.service';
import { MessageComponent } from '../message/message.component';
import {
  MockChannelService,
  mockChannelService,
  mockCurrentUser,
  mockMessage,
} from '../mocks';
import { ImageLoadService } from './image-load.service';
import { MessageListComponent } from './message-list.component';

describe('MessageListComponent', () => {
  let component: MessageListComponent;
  let fixture: ComponentFixture<MessageListComponent>;
  let nativeElement: HTMLElement;
  let channelServiceMock: MockChannelService;
  let queryScrollContainer: () => HTMLElement | null;
  let queryMessageComponents: () => MessageComponent[];
  let queryMessages: () => HTMLElement[];
  let queryScrollToBottomButton: () => HTMLElement | null;

  beforeEach(fakeAsync(() => {
    channelServiceMock = mockChannelService();
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      declarations: [MessageComponent, MessageListComponent],
      providers: [
        { provide: ChannelService, useValue: channelServiceMock },
        {
          provide: ChatClientService,
          useValue: { chatClient: { user: mockCurrentUser() } },
        },
      ],
    });
    fixture = TestBed.createComponent(MessageListComponent);
    component = fixture.componentInstance;
    nativeElement = fixture.nativeElement as HTMLElement;
    queryScrollContainer = () =>
      nativeElement.querySelector('[data-testid="scroll-container"]');
    queryMessageComponents = () =>
      fixture.debugElement
        .queryAll(By.directive(MessageComponent))
        .map((e) => e.componentInstance as MessageComponent);
    queryMessages = () =>
      Array.from(nativeElement.querySelectorAll('[data-testclass="message"]'));
    queryScrollToBottomButton = () =>
      nativeElement.querySelector('[data-testid="scroll-to-bottom"]');
    fixture.detectChanges();
    const scrollContainer = queryScrollContainer()!;
    scrollContainer.style.maxHeight = '300px';
    scrollContainer.style.overflowY = 'auto';
    tick(300);
    fixture.detectChanges();
  }));

  it('should display messages', () => {
    const messages = channelServiceMock.activeChannelMessages$.getValue();
    messages[messages.length - 1].user!.id = 'not' + mockCurrentUser().id;
    channelServiceMock.activeChannelMessages$.next([...messages]);
    fixture.detectChanges();
    const messagesComponents = queryMessageComponents();

    expect(messagesComponents.length).toBe(messages.length);
    messagesComponents.forEach((m, i) => {
      expect(m.message).toBe(messages[i]);
      expect(m.isLastSentMessage).toBe(
        i === messages.length - 2 ? true : false
      );

      expect(m.areReactionsEnabled).toBe(component.areReactionsEnabled);
      expect(m.canReactToMessage).toBe(component.canReactToMessage);
      expect(m.enabledMessageActions).toEqual([
        'send-reaction', // added automatically
        'flag',
        'edit',
        'edit-any',
        'delete',
        'delete-any',
      ]);

      expect(m.canReceiveReadEvents).toBe(component.canReceiveReadEvents);
    });
  });

  it(`should display messages - and shouldn't mark unsent messages as last sent message`, () => {
    const messages = channelServiceMock.activeChannelMessages$.getValue();
    messages[messages.length - 1].status = 'sending';
    channelServiceMock.activeChannelMessages$.next([...messages]);
    fixture.detectChanges();
    const messagesComponents = queryMessageComponents();
    const lastMessage = messagesComponents[messagesComponents.length - 1];

    expect(lastMessage.isLastSentMessage).toBeFalse();
  });

  it('should scroll to bottom, after loading the messages', () => {
    const scrollContainer = queryScrollContainer()!;

    expect(scrollContainer.scrollTop).not.toBe(0);
    expect(scrollContainer.scrollTop).toBe(
      scrollContainer.scrollHeight - scrollContainer.clientHeight
    );
  });

  it('should scroll to bottom, after an image has been loaded', () => {
    const imageLoadService = TestBed.inject(ImageLoadService);
    spyOn(component, 'scrollToBottom');
    imageLoadService.imageLoad$.next();

    expect(component.scrollToBottom).toHaveBeenCalledWith();
  });

  it('should scroll to bottom, if container grows', () => {
    spyOn(component, 'scrollToBottom');
    const child = queryScrollContainer()!.getElementsByTagName('div')[0];
    child.style.height = (child.offsetHeight * 2).toString() + 'px';
    fixture.detectChanges();

    expect(component.scrollToBottom).toHaveBeenCalledWith();
  });

  it(`shouldn't scroll to bottom, after an image has been loaded, if user is scrolled up`, () => {
    component.isUserScrolledUp = true;
    fixture.detectChanges();
    const imageLoadService = TestBed.inject(ImageLoadService);
    spyOn(component, 'scrollToBottom');
    imageLoadService.imageLoad$.next();

    expect(component.scrollToBottom).not.toHaveBeenCalled();
  });

  it('should scroll to bottom, if user has new message', () => {
    const newMessage = mockMessage();
    newMessage.created_at = new Date();
    channelServiceMock.activeChannelMessages$.next([
      ...channelServiceMock.activeChannelMessages$.getValue(),
      newMessage,
    ]);
    fixture.detectChanges();

    expect(queryMessageComponents().length).toBe(
      channelServiceMock.activeChannelMessages$.getValue().length
    );

    const scrollContainer = queryScrollContainer()!;

    expect(scrollContainer.scrollTop).not.toBe(0);
    expect(scrollContainer.scrollTop).toBe(
      scrollContainer.scrollHeight - scrollContainer.clientHeight
    );
  });

  it('should load more messages, if user scrolls up', () => {
    spyOn(channelServiceMock, 'loadMoreMessages');

    const scrollContainer = queryScrollContainer()!;
    scrollContainer.scrollTo({ top: 0 });
    scrollContainer.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    expect(channelServiceMock.loadMoreMessages).toHaveBeenCalledWith();
  });

  it('should handle channel change', () => {
    component.unreadMessageCount = 3;
    component.isUserScrolledUp = true;
    channelServiceMock.activeChannel$.next({ id: 'nextchannel' } as Channel);
    channelServiceMock.activeChannelMessages$.next([]);
    fixture.detectChanges();

    expect(component.unreadMessageCount).toBe(0);
    expect(component.isUserScrolledUp).toBeFalse();
    expect(queryMessageComponents().length).toBe(0);
  });

  it('should preserve scroll position, if older messages are loaded', () => {
    const scrollContainer = queryScrollContainer()!;
    scrollContainer.scrollTo({ top: 0 });
    scrollContainer.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    expect(scrollContainer.scrollTop).not.toBe(0);
  });

  describe('if user scrolled up', () => {
    it(`shouldn't scroll down for new messages`, () => {
      const scrollContainer = queryScrollContainer()!;
      scrollContainer.scrollTo({
        top: (scrollContainer.scrollHeight - scrollContainer.clientHeight) / 2,
      });
      scrollContainer.dispatchEvent(new Event('scroll'));
      fixture.detectChanges();
      const newMessage = mockMessage();
      newMessage.created_at = new Date();
      newMessage.user!.id = 'not' + mockCurrentUser().id;
      channelServiceMock.activeChannelMessages$.next([
        ...channelServiceMock.activeChannelMessages$.getValue(),
        newMessage,
      ]);
      fixture.detectChanges();

      expect(scrollContainer.scrollTop).not.toBe(
        scrollContainer.scrollHeight - scrollContainer.clientHeight
      );
    });

    it('should display unread message count', () => {
      expect(queryScrollToBottomButton()).toBeNull();

      const scrollContainer = queryScrollContainer()!;
      scrollContainer.scrollTo({
        top: (scrollContainer.scrollHeight - scrollContainer.clientHeight) / 2,
      });
      scrollContainer.dispatchEvent(new Event('scroll'));
      fixture.detectChanges();
      const newMessage = mockMessage();
      newMessage.created_at = new Date();
      channelServiceMock.activeChannelMessages$.next([
        ...channelServiceMock.activeChannelMessages$.getValue(),
        newMessage,
      ]);
      fixture.detectChanges();

      expect(queryScrollToBottomButton()?.textContent).toContain('1');
    });

    it('should use a treshold when determining if user is scrolled up', () => {
      const scrollContainer = queryScrollContainer()!;
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight - scrollContainer.clientHeight - 150,
      });
      scrollContainer.dispatchEvent(new Event('scroll'));
      fixture.detectChanges();

      expect(queryScrollToBottomButton()).toBeNull();
    });

    it('should scroll down if user sends new message', () => {
      const scrollContainer = queryScrollContainer()!;
      scrollContainer.scrollTo({
        top: (scrollContainer.scrollHeight - scrollContainer.clientHeight) / 2,
      });
      scrollContainer.dispatchEvent(new Event('scroll'));
      fixture.detectChanges();
      const newMessage = mockMessage();
      newMessage.created_at = new Date();
      channelServiceMock.activeChannelMessages$.next([
        ...channelServiceMock.activeChannelMessages$.getValue(),
        newMessage,
      ]);
      fixture.detectChanges();

      expect(scrollContainer.scrollTop + scrollContainer.clientHeight).toBe(
        scrollContainer.scrollHeight
      );
    });

    it('should display scroll to bottom button', fakeAsync(() => {
      const scrollContainer = queryScrollContainer()!;
      scrollContainer.scrollTo({
        top: (scrollContainer.scrollHeight - scrollContainer.clientHeight) / 2,
      });
      scrollContainer.dispatchEvent(new Event('scroll'));
      fixture.detectChanges();
      queryScrollToBottomButton()?.click();
      fixture.detectChanges();

      expect(scrollContainer.scrollTop + scrollContainer.clientHeight).toBe(
        scrollContainer.scrollHeight
      );
    }));
  });

  it('should apply group styles', () => {
    const messagesElements = queryMessages();

    /* eslint-disable jasmine/new-line-before-expect */
    messagesElements.forEach((m) =>
      expect(m.classList.toString()).toMatch(/middle|top|bottom|single/)
    );
    /* eslint-enable jasmine/new-line-before-expect */
  });

  it('should only enable reactions if channel capabilites permit it', () => {
    channelServiceMock.activeChannel$.next({
      id: 'id',
      data: { own_capabilities: [] },
    } as any as Channel);
    fixture.detectChanges();

    expect(component.canReactToMessage).toBeFalse();
    expect(queryMessageComponents()[0].canReactToMessage).toBeFalse();

    channelServiceMock.activeChannel$.next({
      id: 'id',
      data: { own_capabilities: ['send-reaction'] },
    } as any as Channel);

    expect(component.canReactToMessage).toBeTrue();
  });

  it('should only enable flag action if channel capabilites permit it', () => {
    channelServiceMock.activeChannel$.next({
      id: 'id',
      data: { own_capabilities: [] },
    } as any as Channel);
    component.enabledMessageActionsInput = ['flag'];
    component.ngOnChanges({
      enabledMessageActionsInput: {} as any as SimpleChange,
    });
    fixture.detectChanges();

    expect(queryMessageComponents()[0].enabledMessageActions).toEqual([]);

    channelServiceMock.activeChannel$.next({
      id: 'id',
      data: { own_capabilities: ['flag-message'] },
    } as any as Channel);
    fixture.detectChanges();

    expect(queryMessageComponents()[0].enabledMessageActions).toEqual(['flag']);
  });

  it('should only enable edit action if channel capabilites permit it', () => {
    channelServiceMock.activeChannel$.next({
      id: 'id',
      data: { own_capabilities: [] },
    } as any as Channel);
    component.enabledMessageActionsInput = ['edit'];
    component.ngOnChanges({
      enabledMessageActionsInput: {} as any as SimpleChange,
    });
    fixture.detectChanges();

    expect(queryMessageComponents()[0].enabledMessageActions).toEqual([]);

    channelServiceMock.activeChannel$.next({
      id: 'id',
      data: { own_capabilities: ['update-own-message'] },
    } as any as Channel);
    fixture.detectChanges();

    expect(queryMessageComponents()[0].enabledMessageActions).toEqual(['edit']);

    channelServiceMock.activeChannel$.next({
      id: 'id',
      data: { own_capabilities: ['update-any-message'] },
    } as any as Channel);
    fixture.detectChanges();

    expect(queryMessageComponents()[0].enabledMessageActions).toEqual(['edit']);

    component.enabledMessageActionsInput = ['edit-any'];
    component.ngOnChanges({
      enabledMessageActionsInput: {} as any as SimpleChange,
    });
    fixture.detectChanges();

    expect(queryMessageComponents()[0].enabledMessageActions).toEqual([
      'edit-any',
    ]);
  });

  it('should only enable delete action if channel capabilites permit it', () => {
    channelServiceMock.activeChannel$.next({
      id: 'id',
      data: { own_capabilities: [] },
    } as any as Channel);
    component.enabledMessageActionsInput = ['delete'];
    component.ngOnChanges({
      enabledMessageActionsInput: {} as any as SimpleChange,
    });
    fixture.detectChanges();

    expect(queryMessageComponents()[0].enabledMessageActions).toEqual([]);

    channelServiceMock.activeChannel$.next({
      id: 'id',
      data: { own_capabilities: ['delete-own-message'] },
    } as any as Channel);
    fixture.detectChanges();

    expect(queryMessageComponents()[0].enabledMessageActions).toEqual([
      'delete',
    ]);

    channelServiceMock.activeChannel$.next({
      id: 'id',
      data: { own_capabilities: ['delete-any-message'] },
    } as any as Channel);
    fixture.detectChanges();

    expect(queryMessageComponents()[0].enabledMessageActions).toEqual([
      'delete',
    ]);

    component.enabledMessageActionsInput = ['delete-any'];
    component.ngOnChanges({
      enabledMessageActionsInput: {} as any as SimpleChange,
    });
    fixture.detectChanges();

    expect(queryMessageComponents()[0].enabledMessageActions).toEqual([
      'delete-any',
    ]);
  });
});
