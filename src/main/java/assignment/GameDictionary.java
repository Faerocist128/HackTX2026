package assignment;

// import java.awt;
import java.io.BufferedReader;
import java.io.FileReader;
import java.io.IOException;
import java.util.*;

/**
 * Each GameDictionary object is a trie containing all suffixes from the root.
 * All dictionaries preceding this object form the prefix (of which GameDictionary
 * only stores prev, aka the parent node), whereas all boardPaths in this trie form the suffixes.
 *
 * Because String operations are inefficient, helper methods such as insert
 * and lookup input a start index of the suffix being searched for to prevent
 * string O(n) mutations.
 *
 * There may be time complexity advantages in using StringBuilders, can look into it later
 *
 */

public class GameDictionary implements BoggleDictionary {
    /*
    in case they make varied character files to load into a dictionary, we can
    expand upon this. For now alphabet is a range.
    Methods affected: constructors, validChar
    */

    // Deprecate alphabet
    private final int currentLength;
    private final GameDictionary parent;
    private GameDictionary[] nextChars;
    private boolean wordEnd;


    public GameDictionary() {
        this(0, null);
    }

    private GameDictionary(int currentLength, GameDictionary prev) {
        this.nextChars = new GameDictionary[26];
        this.wordEnd = false;
        this.currentLength = currentLength;
        this.parent = prev;
    }

    private int index(char c) { return (c - 'a');}

    // Recursively builds word path
    public void insert(String word, int index) {
        if (index == word.length()) {
            wordEnd = true;
            return;
        }
        // Creates next node
        int charIndex = index(word.charAt(index));
        if (nextChars[charIndex] == null) {
            nextChars[charIndex] = new GameDictionary(currentLength + 1, this);
        }
        // Recursively calls next character
        nextChars[charIndex].insert(word, index + 1);
    }

    // Build dictionary from file
    public void loadDictionary(String filename) throws IOException {
        BufferedReader bufferedReader = new BufferedReader(new FileReader(filename));
        // Parse words into lowercase and perform insertion
        String word = bufferedReader.readLine();
        while (word != null) {
            word = word.toLowerCase();
            this.insert(word, 0);
            word = bufferedReader.readLine();
        }
    }

    // Lookup prefix
    public boolean isPrefix(String prefix) {
        // Ensure prefix is lowercase
        prefix = prefix.toLowerCase();
        return (this.lookup(prefix, 0) != null);
    }

    // Lookup word and ensure end node is a valid wordEnd
    public boolean contains(String word) {
        // Ensure word is lowercase
        word = word.toLowerCase();
        GameDictionary endNode = this.lookup(word, 0);
        return (endNode != null && endNode.wordEnd);
    }

    // Return the end node of the word, null if not found
    public GameDictionary lookup(String word, int index) {
        if (index == word.length()) return this;
        // Check for character
        int charIndex = this.index(word.charAt(index));
        if (this.nextChars[charIndex] == null) return null;
        // Recursive call
        return this.nextChars[charIndex].lookup(word, index + 1);
    }

    // Iterator
    public DictionaryIterator iterator() {
        return new DictionaryIterator(this);
    }

    public class DictionaryIterator implements Iterator {
        private GameDictionary dict;
        // a last char may be useful for trie traversals

        public DictionaryIterator(GameDictionary dictionary) {
            this.dict = dictionary;
        }

        // return the next smallest non-prefix string relative to this dictionary?
        /** TO DO **/
        public GameDictionary next() { return null; }
        public boolean hasNext() { return false; }

        public GameDictionary dict() {
            return this.dict;
        }
        public GameDictionary next(char c) {
            if (!this.hasNext(c)) return null;
            this.dict = this.dict.nextChars[dict.index(c)];
            return dict;
        }
        public boolean hasNext(char c) {
            // if (!this.dict.validChar(c)) return false;
            return (this.dict.nextChars[dict.index(c)] != null);
        }
        public GameDictionary prev() {
            this.dict = this.dict.parent;
            return this.dict.parent;
        }
        public boolean hasPrev() {
            return this.dict.parent != null;
        }

    }

}